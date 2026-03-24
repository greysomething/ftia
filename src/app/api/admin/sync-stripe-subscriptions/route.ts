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

  // 4. Fetch ALL subscriptions from Stripe
  const allSubs: any[] = []
  for (const status of ['active', 'past_due', 'trialing', 'canceled', 'unpaid'] as const) {
    let hasMore = true
    let startingAfter: string | undefined
    while (hasMore) {
      const params: any = { limit: 100, status, expand: ['data.customer'] }
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
    usersCreated: 0,
    skipped: 0,
    errors: [] as string[],
    byStatus: { active: 0, canceled: 0, past_due: 0, trialing: 0, unpaid: 0 },
  }

  // 5. Process each subscription
  for (const sub of uniqueSubs) {
    try {
      const customer = sub.customer as any
      const email = customer?.email?.toLowerCase()
      if (!email) { stats.skipped++; continue }

      // Count by status
      if (sub.status in stats.byStatus) {
        (stats.byStatus as any)[sub.status]++
      }

      // Map Stripe status → our membership status
      let membershipStatus: string
      switch (sub.status) {
        case 'active': case 'trialing': case 'past_due':
          membershipStatus = 'active'; break
        case 'canceled':
          membershipStatus = 'cancelled'; break
        default:
          membershipStatus = 'expired'; break
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
          emailToUserId.set(email, userId)
          stats.usersCreated++
        }
      }

      if (!userId) { stats.skipped++; continue }

      // Update profile (stripe_customer_id if column exists, display_name always)
      await supabase.from('user_profiles').upsert({
        id: userId,
        display_name: customer.name || email.split('@')[0],
      }, { onConflict: 'id' }).then(() => {
        // Try to set stripe_customer_id separately (column may not exist)
        return supabase.from('user_profiles').update({ stripe_customer_id: customer.id } as any).eq('id', userId)
      }).catch(() => {})
      customerToUserId.set(customer.id, userId)

      // Upsert membership
      const periodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null
      const startDate = sub.start_date
        ? new Date(sub.start_date * 1000).toISOString()
        : new Date(sub.created * 1000).toISOString()

      const membershipRow = {
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
      }

      // Check if membership already exists for this user
      const { data: existingMem } = await supabase
        .from('user_memberships')
        .select('id, status')
        .eq('user_id', userId)
        .single()

      if (existingMem) {
        // Don't overwrite active with cancelled
        if (existingMem.status === 'active' && (membershipStatus === 'cancelled' || membershipStatus === 'expired')) {
          stats.synced++
          continue
        }
        // Update existing
        await supabase.from('user_memberships')
          .update(membershipRow)
          .eq('id', existingMem.id)
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
    } catch (err: any) {
      stats.errors.push(`Sub ${sub.id}: ${err.message}`)
    }
  }

  return NextResponse.json({
    ok: true,
    ...stats,
    message: `Synced ${stats.synced} subscriptions. Created ${stats.usersCreated} new user accounts. ${stats.skipped} skipped.`,
  })
}
