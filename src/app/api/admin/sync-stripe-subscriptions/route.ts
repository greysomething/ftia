import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getActiveStripeKeys } from '@/lib/stripe-settings'
import { moveToActiveMember, moveToPastMember } from '@/lib/resend-audiences'

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

  // Set up Server-Sent Events stream for progress reporting
  const encoder = new TextEncoder()
  const startTime = Date.now()
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null

  function send(data: Record<string, any>) {
    if (!controller) return
    try {
      const payload = JSON.stringify({ ...data, elapsed: Date.now() - startTime })
      controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
    } catch { /* stream may be closed */ }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(c) { controller = c },
  })

  // Run the sync in the background while streaming progress
  ;(async () => {
    try {
      await runSync()
    } catch (err: any) {
      send({ phase: 'error', message: `Sync failed: ${err.message}` })
    } finally {
      try { controller?.close() } catch {}
    }
  })()

  async function runSync() {

  const supabase = createAdminClient()

  send({ phase: 'init', detail: 'Loading membership plans...' })

  // 1. Build price → level mapping from DB
  const { data: levels } = await supabase.from('membership_levels').select('id, name, stripe_price_id, billing_amount, cycle_period, trial_limit')
  const priceLevelMap: Record<string, number> = {}
  for (const l of levels ?? []) {
    if (l.stripe_price_id && l.stripe_price_id.startsWith('price_')) {
      priceLevelMap[l.stripe_price_id] = l.id
    }
  }

  // Build amount → level mapping for fallback matching
  // Group by billing_amount; prefer levels with stripe_price_id set (canonical plans)
  const amountLevelMap: Record<number, number> = {}
  const sortedLevels = [...(levels ?? [])].sort((a, b) => {
    // Prefer levels with stripe_price_id (canonical), then lower ID (original)
    if (a.stripe_price_id && !b.stripe_price_id) return -1
    if (!a.stripe_price_id && b.stripe_price_id) return 1
    return a.id - b.id
  })
  for (const l of sortedLevels) {
    const amt = parseFloat(l.billing_amount)
    if (amt > 0 && !amountLevelMap[amt]) {
      amountLevelMap[amt] = l.id
    }
  }

  /** Find best level_id for a payment amount, falling back to 3 */
  function matchLevelByAmount(amountDollars: number): number {
    if (amountDollars <= 0) return 3
    // Exact match
    if (amountLevelMap[amountDollars]) return amountLevelMap[amountDollars]
    // Close match (within $1 tolerance for rounding)
    for (const l of levels ?? []) {
      if (Math.abs(parseFloat(l.billing_amount) - amountDollars) < 1) return l.id
    }
    return 3
  }

  send({ phase: 'loading_users', detail: 'Loading auth users...' })

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

  send({ phase: 'loading_profiles', detail: `Loaded ${emailToUserId.size} auth users. Loading profiles...` })

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

  send({ phase: 'fetching_subscriptions', detail: 'Fetching subscriptions from Stripe...' })

  // 4. Fetch ALL subscriptions from Stripe (with payment method for card details)
  const allSubs: any[] = []
  const statusTypes = ['active', 'past_due', 'trialing', 'canceled', 'unpaid'] as const
  for (const status of statusTypes) {
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
      send({ phase: 'fetching_subscriptions', detail: `Fetching ${status} subscriptions...`, current: allSubs.length })
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
    levelsCreated: 0,
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
  send({ phase: 'processing_subscriptions', detail: `Found ${bestSubByEmail.size} unique users from ${uniqueSubs.length} subscriptions`, current: 0, total: bestSubByEmail.size, percent: 0 })

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
  let processedCount = 0
  const totalToProcess = bestSubByEmail.size
  for (const [email, sub] of bestSubByEmail) {
    processedCount++
    if (processedCount % 25 === 0 || processedCount === totalToProcess) {
      send({
        phase: 'processing_subscriptions',
        detail: `Processing ${email}...`,
        current: processedCount,
        total: totalToProcess,
        percent: Math.round((processedCount / totalToProcess) * 100),
      })
    }
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
        // Map Stripe status to valid database enum values.
        // Note: 'trialing' and 'past_due' are not valid enum values in our DB,
        // so we map them to 'active' (no real trial plans exist; past_due keeps access).
        switch (sub.status) {
          case 'active':
            membershipStatus = 'active'; break
          case 'trialing':
            membershipStatus = 'active'; break  // all "trials" are paid members
          case 'past_due':
            membershipStatus = 'active'; break  // keep access during payment retries
          case 'canceled':
            membershipStatus = 'cancelled'; break
          default:
            membershipStatus = 'expired'; break
        }
      }

      // Map Stripe price → membership level
      const priceId = sub.items?.data?.[0]?.price?.id
      let levelId = priceId ? priceLevelMap[priceId] : undefined

      // If no exact stripe_price_id match, try matching by amount to existing levels
      // (only match levels that DON'T already have a stripe_price_id set)
      if (!levelId && sub.items?.data?.[0]?.price) {
        const amount = (sub.items.data[0].price.unit_amount || 0) / 100
        const match = (levels ?? []).find((l: any) =>
          !l.stripe_price_id && Math.abs(parseFloat(l.billing_amount) - amount) < 1
        )
        if (match) {
          levelId = match.id
          if (priceId && priceId.startsWith('price_')) {
            priceLevelMap[priceId] = match.id
            await supabase.from('membership_levels').update({ stripe_price_id: priceId }).eq('id', match.id)
          }
        }
      }

      // Auto-create a new membership level for unmapped Stripe prices
      // (legacy prices, promotional prices, etc.)
      if (!levelId && priceId && sub.items?.data?.[0]?.price) {
        const price = sub.items.data[0].price
        const amount = (price.unit_amount || 0) / 100
        const interval = price.recurring?.interval ?? 'month'
        const cyclePeriod = interval === 'year' ? 'Year' : interval === 'week' ? 'Week' : 'Month'
        const cycleNumber = price.recurring?.interval_count ?? 1

        // Fetch product name from Stripe
        let productName = ''
        try {
          const productId = typeof price.product === 'string' ? price.product : (price.product as any)?.id
          if (productId) {
            const product = await stripe.products.retrieve(productId)
            productName = product.name || ''
          }
        } catch { /* use fallback name */ }

        // Build a descriptive name
        const levelName = productName
          || `$${amount.toFixed(2)}/${cyclePeriod.toLowerCase()}`

        // Check if we already created this level in a previous iteration
        const existingAutoLevel = (levels ?? []).find((l: any) => l.stripe_price_id === priceId)
        if (existingAutoLevel) {
          levelId = existingAutoLevel.id
        } else {
          const { data: newLevel, error: levelErr } = await supabase
            .from('membership_levels')
            .insert({
              name: levelName,
              description: `Auto-created from Stripe price ${priceId}`,
              billing_amount: amount,
              initial_payment: amount,
              cycle_number: cycleNumber,
              cycle_period: cyclePeriod,
              stripe_price_id: priceId,
              is_active: true,
              allow_signups: false, // Hidden — legacy/promotional
            })
            .select('id')
            .single()

          if (newLevel) {
            levelId = newLevel.id
            priceLevelMap[priceId] = newLevel.id
            // Add to local levels array so subsequent subs can match
            ;(levels ?? []).push({
              id: newLevel.id,
              name: levelName,
              stripe_price_id: priceId,
              billing_amount: String(amount),
              cycle_period: cyclePeriod,
            })
            stats.levelsCreated = (stats.levelsCreated ?? 0) + 1
            console.log(`[Stripe Sync] Auto-created level "${levelName}" for price ${priceId} ($${amount}/${cyclePeriod})`)
          } else if (levelErr) {
            stats.errors.push(`Failed to create level for ${priceId}: ${levelErr.message}`)
          }
        }
      }

      if (!levelId) levelId = 3 // Last resort fallback

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

  send({ phase: 'backfilling_orders', detail: 'Loading existing payment records...', current: 0, percent: 0 })

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

  send({ phase: 'backfilling_orders', detail: 'Fetching paid invoices from Stripe...', current: 0 })

  // Fetch all paid invoices from Stripe (auto-paginate through ALL pages)
  let invoiceStartingAfter: string | undefined
  let hasMoreInvoices = true
  let invoicesFetched = 0
  while (hasMoreInvoices) {
    const params: any = { limit: 100, status: 'paid', expand: ['data.charge'] }
    if (invoiceStartingAfter) params.starting_after = invoiceStartingAfter
    const batch = await stripe.invoices.list(params)
    invoicesFetched += batch.data.length
    send({ phase: 'backfilling_orders', detail: `Processing invoices... (${stats.ordersBackfilled} new)`, current: invoicesFetched })

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
        // Fallback: look up the user's membership by subscription ID to get their actual level
        if (!invLevelId && subId) {
          const { data: subMembership } = await supabase
            .from('user_memberships')
            .select('level_id')
            .eq('stripe_subscription_id', subId)
            .limit(1)
            .maybeSingle()
          if (subMembership?.level_id) invLevelId = subMembership.level_id
        }
        // Final fallback: match by invoice amount
        const invAmountDollars = inv.amount_paid ? (inv.amount_paid / 100) : 0
        if (!invLevelId) invLevelId = matchLevelByAmount(invAmountDollars)

        // Extract card info from charge if available
        const charge = inv.charge as any
        const invCard = charge?.payment_method_details?.card

        // Use upsert with payment_transaction_id to prevent duplicate records
        const orderRow = {
          user_id: userId,
          level_id: invLevelId,
          status: 'success',
          total: invAmountDollars,
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
          billing_reason: inv.billing_reason ?? null,
        }

        // Double-check for existing record with same payment_transaction_id before insert
        const { data: existingOrder } = await supabase
          .from('membership_orders')
          .select('id')
          .eq('payment_transaction_id', piId)
          .limit(1)

        if (existingOrder && existingOrder.length > 0) {
          // Update billing_reason on existing records that are missing it
          if (inv.billing_reason) {
            await supabase
              .from('membership_orders')
              .update({
                billing_reason: inv.billing_reason,
                ...(invCard ? {
                  cardtype: invCard.brand ?? null,
                  accountnumber: invCard.last4 ?? null,
                  expirationmonth: invCard.exp_month ? String(invCard.exp_month) : null,
                  expirationyear: invCard.exp_year ? String(invCard.exp_year) : null,
                } : {}),
              })
              .eq('id', existingOrder[0].id)
              .is('billing_reason', null)
          }
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

  // 6b. Backfill from Stripe charges (catches checkout session payments not tied to invoices).
  // The invoice backfill above only fetches paid invoices, but some payments come through
  // checkout sessions (shown as "Order #XXX" in Stripe) which don't create invoice records.
  send({ phase: 'backfilling_orders', detail: 'Fetching charges from Stripe...', current: invoicesFetched })

  let chargeStartingAfter: string | undefined
  let hasMoreCharges = true
  let chargesFetched = 0
  while (hasMoreCharges) {
    const params: any = { limit: 100, expand: ['data.payment_intent'] }
    if (chargeStartingAfter) params.starting_after = chargeStartingAfter
    const batch = await stripe.charges.list(params)
    chargesFetched += batch.data.length
    send({ phase: 'backfilling_orders', detail: `Processing charges... (${stats.ordersBackfilled} orders total)`, current: invoicesFetched + chargesFetched })

    for (const rawCharge of batch.data) {
      try {
        const charge = rawCharge as any
        if (charge.status !== 'succeeded') continue
        if (charge.refunded) continue // Skip fully refunded charges

        const piId = charge.payment_intent
          ? (typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id)
          : null
        if (!piId) continue

        // Skip if already recorded
        if (existingTxIds.has(piId)) continue

        const custId = typeof charge.customer === 'string' ? charge.customer : (charge.customer as any)?.id
        let userId = customerToUserId.get(custId ?? '') ?? null

        // Fallback: resolve by email
        if (!userId && charge.billing_details?.email) {
          userId = emailToUserId.get(charge.billing_details.email.toLowerCase()) ?? null
          if (userId && custId) customerToUserId.set(custId, userId)
        }

        if (!userId) continue

        // Try to match price/level from payment intent metadata or subscription
        const pi = typeof charge.payment_intent === 'object' ? charge.payment_intent : null
        const piLevelId = pi?.metadata?.level_id ? parseInt(pi.metadata.level_id, 10) : undefined
        const chargeAmountDollars = charge.amount ? (charge.amount / 100) : 0
        let chargeLevelId = piLevelId
        // Fallback: look up user's membership by subscription to get actual level
        if (!chargeLevelId && pi?.metadata?.subscription_id) {
          const { data: subMem } = await supabase
            .from('user_memberships')
            .select('level_id')
            .eq('stripe_subscription_id', pi.metadata.subscription_id)
            .limit(1)
            .maybeSingle()
          if (subMem?.level_id) chargeLevelId = subMem.level_id
        }
        if (!chargeLevelId) chargeLevelId = matchLevelByAmount(chargeAmountDollars)

        const chargeCard = charge.payment_method_details?.card

        const orderRow = {
          user_id: userId,
          level_id: chargeLevelId,
          status: 'success',
          total: charge.amount ? (charge.amount / 100) : 0,
          gateway: 'stripe',
          payment_transaction_id: piId,
          subscription_transaction_id: pi?.metadata?.subscription_id ?? null,
          billing_name: charge.billing_details?.name ?? null,
          billing_email: charge.billing_details?.email ?? null,
          cardtype: chargeCard?.brand ?? null,
          accountnumber: chargeCard?.last4 ?? null,
          expirationmonth: chargeCard?.exp_month ? String(chargeCard.exp_month) : null,
          expirationyear: chargeCard?.exp_year ? String(chargeCard.exp_year) : null,
          timestamp: new Date(charge.created * 1000).toISOString(),
          notes: charge.description || null,
          billing_reason: 'charge',
        }

        // Double-check for duplicates
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
        stats.errors.push(`Charge ${rawCharge.id}: ${err.message}`)
      }
    }

    hasMoreCharges = batch.has_more
    if (batch.data.length > 0) chargeStartingAfter = batch.data[batch.data.length - 1].id
  }

  send({ phase: 'backfilling_customers', detail: 'Checking Stripe customer names...', current: 0 })

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

  send({ phase: 'syncing_audiences', detail: 'Syncing email marketing audiences...' })

  // 8. Sync Resend audiences — bulk-add active members and move cancelled/expired to Past Members
  let audienceSynced = 0
  let audienceErrors = 0
  try {
    // Fetch all memberships with their profile emails
    const { data: allMemberships } = await supabase
      .from('user_memberships')
      .select('user_id, status, user_profiles!inner(email, first_name, last_name)')

    if (allMemberships) {
      for (const mem of allMemberships as any[]) {
        const profile = mem.user_profiles
        if (!profile?.email) continue

        try {
          if (mem.status === 'active' || mem.status === 'trialing') {
            await moveToActiveMember(profile.email, profile.first_name ?? undefined, profile.last_name ?? undefined)
          } else if (mem.status === 'cancelled' || mem.status === 'expired') {
            await moveToPastMember(profile.email, profile.first_name ?? undefined, profile.last_name ?? undefined)
          }
          audienceSynced++
        } catch {
          audienceErrors++
        }
      }
    }
    console.log(`[Stripe Sync] Resend audiences synced: ${audienceSynced} contacts (${audienceErrors} errors)`)
  } catch (err: any) {
    console.error('[Stripe Sync] Resend audience sync failed:', err)
    stats.errors.push(`Audience sync failed: ${err.message}`)
  }

  const message = [
    `Processed ${bestSubByEmail.size} unique users from ${stats.totalSubscriptions} total Stripe subscriptions.`,
    `Stripe breakdown: ${stats.byStatus.active} active (${stats.byStatus.active_cancelling} cancelling at period end), ${stats.byStatus.trialing} trialing, ${stats.byStatus.past_due} past due, ${stats.byStatus.canceled} canceled, ${stats.byStatus.unpaid} unpaid.`,
    `Synced: ${stats.syncedAsActive} active, ${stats.syncedAsTrialing} trialing, ${stats.syncedAsPastDue} past due, ${stats.syncedAsCancelled} cancelled, ${stats.syncedAsExpired} expired.`,
    stats.usersCreated > 0 ? `Created ${stats.usersCreated} new accounts.` : '',
    stats.levelsCreated > 0 ? `Auto-created ${stats.levelsCreated} new membership levels for unmapped Stripe prices.` : '',
    stats.ordersBackfilled > 0 ? `Backfilled ${stats.ordersBackfilled} payment records.` : '',
    stripeCustomersBackfilled > 0 ? `Backfilled name on ${stripeCustomersBackfilled} Stripe customers.` : '',
    stats.skipped > 0 ? `${stats.skipped} skipped.` : '',
  ].filter(Boolean).join(' ')

  send({
    phase: 'done',
    ok: true,
    message,
    ...stats,
    stripeCustomersBackfilled,
    audienceSynced,
    audienceErrors,
    uniqueUsers: bestSubByEmail.size,
  })

  } // end runSync()

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
