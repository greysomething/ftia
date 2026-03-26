import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getActiveStripeKeys } from '@/lib/stripe-settings'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/admin/sync-stripe-subscriptions
 *
 * Pulls ALL subscriptions from Stripe and syncs them to user_memberships.
 * Creates Supabase auth accounts for new users (with random passwords).
 * Maps Stripe prices to membership_levels by price ID or amount.
 */
export async function POST() {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { secretKey } = await getActiveStripeKeys()
  if (!secretKey || secretKey.length < 20) {
    return NextResponse.json({
      error: 'Stripe secret key not configured or invalid. Go to Admin > Merchant Settings and save your Stripe keys first.',
    }, { status: 400 })
  }

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' as any })

  // Test the key first
  try {
    await stripe.customers.list({ limit: 1 })
  } catch (err: any) {
    return NextResponse.json({ error: `Stripe key invalid: ${err.message}` }, { status: 400 })
  }

  const supabase = createAdminClient()

  // 1. Build price → level mapping from DB
  const { data: levels } = await supabase.from('membership_levels').select('id, name, stripe_price_id, billing_amount, cycle_period')
  const priceLevelMap: Record<string, number> = {}
  for (const l of levels ?? []) {
    if (l.stripe_price_id && l.stripe_price_id.startsWith('price_')) {
      priceLevelMap[l.stripe_price_id] = l.id
    }
  }

  // 2. Pre-load all auth users into an email→id map (paginated)
  const emailToUserId = new Map<string, string>()
  let userPage = 1
  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ page: userPage, perPage: 1000 })
    if (error || !users || users.length === 0) break
    for (const u of users) {
      if (u.email) emailToUserId.set(u.email.toLowerCase(), u.id)
    }
    if (users.length < 1000) break
    userPage++
  }
  console.log(`[Stripe Sync] Pre-loaded ${emailToUserId.size} auth users`)

  // 3. Pre-load stripe_customer_id → user_id from profiles (if column exists)
  const customerToUserId = new Map<string, string>()
  try {
    let profPage = 0
    while (true) {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, stripe_customer_id')
        .not('stripe_customer_id', 'is', null)
        .range(profPage * 1000, profPage * 1000 + 999)
      if (error || !data || data.length === 0) break
      for (const p of data as any[]) {
        if (p.stripe_customer_id) customerToUserId.set(p.stripe_customer_id, p.id)
      }
      if (data.length < 1000) break
      profPage++
    }
  } catch { /* stripe_customer_id column may not exist yet */ }

  // 4. Fetch ALL subscriptions from Stripe (with payment method for card details)
  const allSubs: any[] = []
  for (const status of ['active', 'past_due', 'trialing', 'canceled', 'unpaid'] as const) {
    let hasMore = true
    let startingAfter: string | undefined
    while (hasMore) {
      const params: any = {
        limit: 100,
        status,
        expand: ['data.customer', 'data.default_payment_method'],
      }
      if (startingAfter) params.starting_after = startingAfter
      const batch = await stripe.subscriptions.list(params)
      allSubs.push(...batch.data)
      hasMore = batch.has_more
      if (batch.data.length > 0) startingAfter = batch.data[batch.data.length - 1].id
    }
  }

  // Deduplicate
  const subMap = new Map<string, any>()
  for (const sub of allSubs) subMap.set(sub.id, sub)
  const uniqueSubs = Array.from(subMap.values())

  const stats = {
    totalSubscriptions: uniqueSubs.length,
    synced: 0,
    syncedAsActive: 0,
    syncedAsTrialing: 0,
    syncedAsPastDue: 0,
    syncedAsCancelled: 0,
    syncedAsExpired: 0,
    usersCreated: 0,
    skipped: 0,
    ordersBackfilled: 0,
    errors: [] as string[],
    byStatus: { active: 0, active_cancelling: 0, canceled: 0, past_due: 0, trialing: 0, unpaid: 0 },
  }

  // Count by status (distinguish truly active vs cancel_at_period_end)
  for (const sub of uniqueSubs) {
    if (sub.status === 'active' && sub.cancel_at_period_end) {
      stats.byStatus.active_cancelling++
    } else if (sub.status in stats.byStatus) {
      (stats.byStatus as any)[sub.status]++
    }
  }

  // 5. Group subscriptions by customer email and pick the BEST one per user.
  // Priority: truly active > trialing > past_due > active+cancelling > canceled > unpaid
  // Subscriptions with cancel_at_period_end=true are treated as "cancelling" — the user
  // has already cancelled, they just have access until their period ends.
  function getSubPriority(sub: any): number {
    if (sub.status === 'active' && !sub.cancel_at_period_end) return 6
    if (sub.status === 'trialing') return 5
    if (sub.status === 'past_due') return 4
    if (sub.status === 'active' && sub.cancel_at_period_end) return 3  // cancelling
    if (sub.status === 'canceled') return 2
    return 1 // unpaid or other
  }

  const bestSubByEmail = new Map<string, any>()
  for (const sub of uniqueSubs) {
    const email = (sub.customer as any)?.email?.toLowerCase()
    if (!email) continue

    const existing = bestSubByEmail.get(email)
    if (!existing) {
      bestSubByEmail.set(email, sub)
      continue
    }

    const existingPriority = getSubPriority(existing)
    const newPriority = getSubPriority(sub)

    // Higher priority wins; tie-break by most recent creation
    if (newPriority > existingPriority ||
        (newPriority === existingPriority && (sub.created ?? 0) > (existing.created ?? 0))) {
      bestSubByEmail.set(email, sub)
    }
  }

  console.log(`[Stripe Sync] ${uniqueSubs.length} total subs → ${bestSubByEmail.size} unique users. Active: ${stats.byStatus.active}, Cancelling: ${stats.byStatus.active_cancelling}, Canceled: ${stats.byStatus.canceled}`)

  // 5b. RESET: Delete ALL existing membership records before re-importing.
  // This prevents duplicate rows from accumulating across syncs.
  // Users and profiles are preserved — only the membership link rows are cleared.
  const { count: deletedCount } = await supabase
    .from('user_memberships')
    .delete()
    .neq('id', 0) // delete all rows
    .select('*', { count: 'exact', head: true })
  console.log(`[Stripe Sync] Cleared ${deletedCount ?? 'all'} existing membership records`)

  // 5c. Process the single best subscription per user
  for (const [email, sub] of bestSubByEmail) {
    try {
      const customer = sub.customer as any
      if (!email) { stats.skipped++; continue }

      // Map Stripe status → our membership status
      // Key: if cancel_at_period_end is true, the user has cancelled even though
      // Stripe still reports status as 'active'. Treat these as 'cancelled'.
      let membershipStatus: string
      if (sub.status === 'active' && sub.cancel_at_period_end) {
        // User cancelled but still has access until period ends
        membershipStatus = 'cancelled'
      } else {
        switch (sub.status) {
          case 'active':
            membershipStatus = 'active'; break
          case 'trialing':
            membershipStatus = 'trialing'; break
          case 'past_due':
            membershipStatus = 'past_due'; break
          case 'canceled':
            membershipStatus = 'cancelled'; break
          default:
            membershipStatus = 'expired'; break
        }
      }

      // Map Stripe price → membership level
      const priceId = sub.items?.data?.[0]?.price?.id
      let levelId = priceId ? priceLevelMap[priceId] : undefined

      if (!levelId && sub.items?.data?.[0]?.price) {
        const amount = (sub.items.data[0].price.unit_amount || 0) / 100
        const match = (levels ?? []).find((l: any) => Math.abs(parseFloat(l.billing_amount) - amount) < 1)
        if (match) {
          levelId = match.id
          // Auto-map this price for future
          if (priceId && priceId.startsWith('price_')) {
            priceLevelMap[priceId] = match.id
            await supabase.from('membership_levels').update({ stripe_price_id: priceId }).eq('id', match.id)
          }
        }
      }

      if (!levelId) levelId = 3 // Default: Monthly Unlimited

      // Find or create user
      let userId: string | null = null

      // A) Check by stripe_customer_id in profiles
      userId = customerToUserId.get(customer.id) ?? null

      // B) Check by email in auth users
      if (!userId) {
        userId = emailToUserId.get(email) ?? null
      }

      // C) Create new auth user
      if (!userId) {
        const { data: newUser, error: authError } = await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
          password: crypto.randomUUID(),
          user_metadata: { full_name: customer.name || email.split('@')[0] },
        })

        if (authError) {
          if (authError.message?.includes('already')) {
            // Race condition — re-check
            const { data: { users } } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
            const found = users?.find((u: any) => u.email?.toLowerCase() === email)
            if (found) userId = found.id
          }
          if (!userId) {
            stats.errors.push(`${email}: ${authError.message}`)
            stats.skipped++
            continue
          }
        } else if (newUser?.user) {
          userId = newUser.user.id
          emailToUserId.set(email, userId!)
          stats.usersCreated++
        }
      }

      if (!userId) { stats.skipped++; continue }

      // Update profile with Stripe customer data
      // Use Stripe customer creation date as the real "joined" date
      const stripeJoined = customer.created
        ? new Date(customer.created * 1000).toISOString()
        : undefined
      await supabase.from('user_profiles').upsert({
        id: userId,
        display_name: customer.name || email.split('@')[0],
        ...(stripeJoined ? { created_at: stripeJoined } : {}),
      }, { onConflict: 'id' }).then(() => {
        // Try to set stripe_customer_id separately (column may not exist)
        return supabase.from('user_profiles').update({ stripe_customer_id: customer.id } as any).eq('id', userId)
      }).catch(() => {})
      customerToUserId.set(customer.id, userId)

      // Upsert membership — using the single best subscription
      const periodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null
      const startDate = sub.start_date
        ? new Date(sub.start_date * 1000).toISOString()
        : new Date(sub.created * 1000).toISOString()

      // Extract card details from default payment method
      // Fallback: if subscription has no default_payment_method, try
      // the customer's invoice_settings.default_payment_method or list
      // the customer's payment methods directly.
      let pm = sub.default_payment_method as any
      if (!pm?.card && customer?.id) {
        try {
          // Try customer's invoice_settings.default_payment_method
          const fullCustomer = await stripe.customers.retrieve(customer.id, {
            expand: ['invoice_settings.default_payment_method'],
          })
          const invoicePm = (fullCustomer as any)?.invoice_settings?.default_payment_method
          if (invoicePm?.card) {
            pm = invoicePm
          } else {
            // Last resort: list the customer's payment methods
            const pms = await stripe.paymentMethods.list({
              customer: customer.id,
              type: 'card',
              limit: 1,
            })
            if (pms.data.length > 0) {
              pm = pms.data[0]
            }
          }
        } catch { /* ignore — card details are best-effort */ }
      }
      const card = pm?.card ?? null
      const cardFields = card ? {
        card_type: card.brand ?? null,       // visa, mastercard, amex, etc.
        card_last4: card.last4 ?? null,
        card_exp_month: String(card.exp_month ?? ''),
        card_exp_year: String(card.exp_year ?? ''),
      } : {}

      // Billing address from customer or payment method
      const billingAddress = pm?.billing_details?.address ?? customer?.address ?? null

      const membershipRow: Record<string, any> = {
        user_id: userId,
        level_id: levelId,
        status: membershipStatus,
        stripe_customer_id: customer.id,
        stripe_subscription_id: sub.id,
        startdate: startDate,
        enddate: periodEnd,
        billing_first_name: customer.name?.split(' ')[0] ?? '',
        billing_last_name: customer.name?.split(' ').slice(1).join(' ') ?? '',
        billing_email: email,
        modified: new Date().toISOString(),
        ...cardFields,
        ...(billingAddress ? {
          billing_address1: billingAddress.line1 ?? null,
          billing_city: billingAddress.city ?? null,
          billing_state: billingAddress.state ?? null,
          billing_zip: billingAddress.postal_code ?? null,
          billing_country: billingAddress.country ?? null,
        } : {}),
      }

      // Check if membership already exists for this user
      // Use select + limit instead of .single() which errors on multiple rows
      const { data: existingMems } = await supabase
        .from('user_memberships')
        .select('id')
        .eq('user_id', userId)

      if (existingMems && existingMems.length > 0) {
        // Update the first row, delete any extras (cleanup duplicates)
        await supabase.from('user_memberships')
          .update(membershipRow)
          .eq('id', existingMems[0].id)
        if (existingMems.length > 1) {
          const extraIds = existingMems.slice(1).map((m: any) => m.id)
          await supabase.from('user_memberships').delete().in('id', extraIds)
        }
      } else {
        // Insert new
        const { error: insertErr } = await supabase.from('user_memberships').insert(membershipRow)
        if (insertErr) {
          stats.errors.push(`${email}: ${insertErr.message}`)
          stats.skipped++
          continue
        }
      }

      stats.synced++
      if (membershipStatus === 'active') stats.syncedAsActive++
      else if (membershipStatus === 'trialing') stats.syncedAsTrialing++
      else if (membershipStatus === 'past_due') stats.syncedAsPastDue++
      else if (membershipStatus === 'cancelled') stats.syncedAsCancelled++
      else stats.syncedAsExpired++
    } catch (err: any) {
      stats.errors.push(`Sub ${sub.id}: ${err.message}`)
    }
  }

  // 6. Backfill invoice/payment history into membership_orders
  // Pre-load existing payment_transaction_ids to avoid duplicates
  const existingTxIds = new Set<string>()
  let txPage = 0
  while (true) {
    const { data } = await supabase
      .from('membership_orders')
      .select('payment_transaction_id')
      .not('payment_transaction_id', 'is', null)
      .range(txPage * 1000, txPage * 1000 + 999)
    if (!data || data.length === 0) break
    for (const row of data) {
      if (row.payment_transaction_id) existingTxIds.add(row.payment_transaction_id)
    }
    if (data.length < 1000) break
    txPage++
  }

  // Fetch all paid invoices from Stripe (auto-paginate through ALL pages)
  let invoiceStartingAfter: string | undefined
  let hasMoreInvoices = true
  while (hasMoreInvoices) {
    const params: any = { limit: 100, status: 'paid', expand: ['data.charge'] }
    if (invoiceStartingAfter) params.starting_after = invoiceStartingAfter
    const batch = await stripe.invoices.list(params)

    for (const rawInv of batch.data) {
      try {
        const inv = rawInv as any
        const piId = inv.payment_intent as string | null
        if (!piId) continue

        // Skip if already recorded (deduplicate by payment_transaction_id)
        if (existingTxIds.has(piId)) continue

        const custId = typeof inv.customer === 'string' ? inv.customer : (inv.customer as any)?.id

        // Try to resolve user from customer ID map first
        let userId = customerToUserId.get(custId ?? '') ?? null

        // Fallback: resolve user by invoice customer email → auth user email
        if (!userId && inv.customer_email) {
          const invoiceEmail = inv.customer_email.toLowerCase()
          userId = emailToUserId.get(invoiceEmail) ?? null
          // Cache the mapping so we don't re-lookup for this customer's other invoices
          if (userId && custId) customerToUserId.set(custId, userId)
        }

        if (!userId) continue

        // Determine level from subscription
        const subId = inv.subscription as string | null
        const matchedSub = subId ? subMap.get(subId) : null
        const invPriceId = inv.lines?.data?.[0]?.price?.id
        let invLevelId = invPriceId ? priceLevelMap[invPriceId] : undefined
        if (!invLevelId && matchedSub) {
          const mSubPriceId = matchedSub.items?.data?.[0]?.price?.id
          invLevelId = mSubPriceId ? priceLevelMap[mSubPriceId] : undefined
        }
        if (!invLevelId) invLevelId = 3

        // Extract card info from charge if available
        const charge = inv.charge as any
        const invCard = charge?.payment_method_details?.card

        // Use upsert with payment_transaction_id to prevent duplicate records
        const orderRow = {
          user_id: userId,
          level_id: invLevelId,
          status: 'success',
          total: inv.amount_paid ? (inv.amount_paid / 100) : 0,
          subtotal: inv.subtotal ? (inv.subtotal / 100) : null,
          tax: inv.tax ? (inv.tax / 100) : null,
          gateway: 'stripe',
          payment_transaction_id: piId,
          subscription_transaction_id: subId ?? null,
          billing_name: inv.customer_name ?? null,
          billing_email: inv.customer_email ?? null,
          cardtype: invCard?.brand ?? null,
          accountnumber: invCard?.last4 ?? null,
          expirationmonth: invCard?.exp_month ? String(invCard.exp_month) : null,
          expirationyear: invCard?.exp_year ? String(invCard.exp_year) : null,
          timestamp: inv.status_transitions?.paid_at
            ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
            : new Date((inv.created ?? 0) * 1000).toISOString(),
          notes: inv.number ? `Invoice ${inv.number}` : null,
        }

        // Double-check for existing record with same payment_transaction_id before insert
        const { data: existingOrder } = await supabase
          .from('membership_orders')
          .select('id')
          .eq('payment_transaction_id', piId)
          .limit(1)

        if (existingOrder && existingOrder.length > 0) {
          existingTxIds.add(piId)
          continue
        }

        await supabase.from('membership_orders').insert(orderRow)
        existingTxIds.add(piId)
        stats.ordersBackfilled++
      } catch (err: any) {
        // Don't fail the whole sync for individual invoice errors
        stats.errors.push(`Invoice ${rawInv.id}: ${err.message}`)
      }
    }

    hasMoreInvoices = batch.has_more
    if (batch.data.length > 0) invoiceStartingAfter = batch.data[batch.data.length - 1].id
  }

  // 7. Backfill Stripe customer name/description from user_profiles
  // For any Stripe customer that has no name set, populate it from the
  // first_name/last_name stored in user_profiles so Stripe's dashboard
  // and receipts show real names instead of blank entries.
  let stripeCustomersBackfilled = 0
  try {
    // Fetch all profiles that have a stripe_customer_id and at least one name field
    const profilesToCheck: { id: string; stripe_customer_id: string; first_name: string | null; last_name: string | null }[] = []
    let namePage = 0
    while (true) {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, stripe_customer_id, first_name, last_name')
        .not('stripe_customer_id', 'is', null)
        .range(namePage * 1000, namePage * 1000 + 999)
      if (error || !data || data.length === 0) break
      for (const p of data as any[]) {
        if (p.stripe_customer_id && (p.first_name || p.last_name)) {
          profilesToCheck.push(p)
        }
      }
      if (data.length < 1000) break
      namePage++
    }

    console.log(`[Stripe Sync] Checking ${profilesToCheck.length} profiles for Stripe customer name backfill`)

    for (const profile of profilesToCheck) {
      try {
        const stripeCustomer = await stripe.customers.retrieve(profile.stripe_customer_id)
        if ((stripeCustomer as any).deleted) continue

        // Only update if the Stripe customer has no name set
        if (!(stripeCustomer as any).name) {
          const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ')
          const email = (stripeCustomer as any).email || ''
          const description = email ? `${fullName} (${email})` : fullName

          await stripe.customers.update(profile.stripe_customer_id, {
            name: fullName,
            description,
          })
          stripeCustomersBackfilled++
        }
      } catch (err: any) {
        // Don't fail the whole sync for individual customer update errors
        stats.errors.push(`Stripe customer backfill ${profile.stripe_customer_id}: ${err.message}`)
      }
    }
    console.log(`[Stripe Sync] Backfilled name on ${stripeCustomersBackfilled} Stripe customers`)
  } catch (err: any) {
    stats.errors.push(`Stripe customer name backfill failed: ${err.message}`)
  }

  return NextResponse.json({
    ok: true,
    ...stats,
    stripeCustomersBackfilled,
    uniqueUsers: bestSubByEmail.size,
    message: [
      `Processed ${bestSubByEmail.size} unique users from ${stats.totalSubscriptions} total Stripe subscriptions.`,
      `Stripe breakdown: ${stats.byStatus.active} active (${stats.byStatus.active_cancelling} cancelling at period end), ${stats.byStatus.trialing} trialing, ${stats.byStatus.past_due} past due, ${stats.byStatus.canceled} canceled, ${stats.byStatus.unpaid} unpaid.`,
      `Synced: ${stats.syncedAsActive} active, ${stats.syncedAsTrialing} trialing, ${stats.syncedAsPastDue} past due, ${stats.syncedAsCancelled} cancelled, ${stats.syncedAsExpired} expired.`,
      stats.usersCreated > 0 ? `Created ${stats.usersCreated} new accounts.` : '',
      stats.ordersBackfilled > 0 ? `Backfilled ${stats.ordersBackfilled} payment records.` : '',
      stripeCustomersBackfilled > 0 ? `Backfilled name on ${stripeCustomersBackfilled} Stripe customers.` : '',
      stats.skipped > 0 ? `${stats.skipped} skipped.` : '',
    ].filter(Boolean).join(' '),
  })
}
