import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Use US Eastern time for date bucketing — matches Stripe dashboard
const TIMEZONE = 'America/New_York'

/** Convert a UTC timestamp to a YYYY-MM-DD string in ET */
function toLocalDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}

/** Get today's date in ET */
function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}

export async function GET(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const days = Math.max(1, Math.min(366, parseInt(searchParams.get('days') ?? '30', 10)))

  const supabase = createAdminClient()
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceISO = since.toISOString()

  // Fetch all orders in the date range (both success and refunded)
  const allOrders: Array<{
    user_id: string
    timestamp: string
    total: number
    billing_reason: string | null
    status: string
  }> = []

  let page = 0
  while (true) {
    const from = page * 1000
    const { data, error } = await supabase
      .from('membership_orders')
      .select('user_id, timestamp, total, billing_reason, status')
      .gte('timestamp', sinceISO)
      .in('status', ['success', 'refunded'])
      .order('timestamp', { ascending: true })
      .range(from, from + 999)
    if (error) {
      console.error('[analytics] supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data || data.length === 0) break
    allOrders.push(...data)
    if (data.length < 1000) break
    page++
  }

  // Identify users whose first-ever order date we need to know, so we can
  // decide new vs recurring when billing_reason is missing/ambiguous.
  // We include any successful order, since legacy/backfilled rows may
  // have billing_reason === 'charge' or null instead of 'subscription_create'.
  const usersNeedingLookup = new Set<string>()
  for (const order of allOrders) {
    if (order.status !== 'success') continue
    if (order.billing_reason === 'subscription_create' || order.billing_reason === 'subscription_cycle') continue
    usersNeedingLookup.add(order.user_id)
  }

  const firstOrderMap: Record<string, string> = {}
  if (usersNeedingLookup.size > 0) {
    const userIds = [...usersNeedingLookup]
    for (let i = 0; i < userIds.length; i += 100) {
      const batch = userIds.slice(i, i + 100)
      const { data } = await supabase
        .from('membership_orders')
        .select('user_id, timestamp')
        .in('user_id', batch)
        .eq('status', 'success')
        .order('timestamp', { ascending: true })

      for (const row of data ?? []) {
        if (!firstOrderMap[row.user_id] || row.timestamp < firstOrderMap[row.user_id]) {
          firstOrderMap[row.user_id] = row.timestamp
        }
      }
    }
  }

  // Build daily buckets using ET dates
  const buckets: Record<string, {
    newSignups: number; rebills: number
    signupRevenue: number; rebillRevenue: number; revenue: number
    refunds: number; refundAmount: number
  }> = {}

  const today = todayLocal()
  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setDate(d.getDate() - (days - 1 - i))
    const key = d.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
    if (key > today) continue
    buckets[key] = {
      newSignups: 0, rebills: 0,
      signupRevenue: 0, rebillRevenue: 0, revenue: 0,
      refunds: 0, refundAmount: 0,
    }
  }

  // Categorize each order
  for (const order of allOrders) {
    if (!order.timestamp) continue
    const key = toLocalDate(order.timestamp)
    if (!buckets[key]) continue

    // Refunds
    if (order.status === 'refunded') {
      buckets[key].refunds++
      buckets[key].refundAmount += Math.abs(order.total ?? 0)
      buckets[key].revenue -= Math.abs(order.total ?? 0)
      continue
    }

    // New vs recurring classification
    let isNewSignup: boolean
    if (order.billing_reason === 'subscription_create') {
      isNewSignup = true
    } else if (order.billing_reason === 'subscription_cycle') {
      isNewSignup = false
    } else {
      // Legacy / null / 'charge' — fall back to first-order heuristic.
      // CRITICAL: compare both sides in ET to avoid a day drift that
      // previously misclassified evening-ET signups as recurring.
      const firstTs = firstOrderMap[order.user_id]
      const firstDate = firstTs ? toLocalDate(firstTs) : null
      isNewSignup = firstDate === toLocalDate(order.timestamp)
    }

    if (isNewSignup) {
      buckets[key].newSignups++
      buckets[key].signupRevenue += order.total ?? 0
    } else {
      buckets[key].rebills++
      buckets[key].rebillRevenue += order.total ?? 0
    }
    buckets[key].revenue += order.total ?? 0
  }

  const chartData = Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, ...data }))

  const totalNewSignups = chartData.reduce((s, d) => s + d.newSignups, 0)
  const totalRebills = chartData.reduce((s, d) => s + d.rebills, 0)
  const totalRevenue = chartData.reduce((s, d) => s + d.revenue, 0)
  const totalSignupRevenue = chartData.reduce((s, d) => s + d.signupRevenue, 0)
  const totalRebillRevenue = chartData.reduce((s, d) => s + d.rebillRevenue, 0)
  const totalRefunds = chartData.reduce((s, d) => s + d.refunds, 0)
  const totalRefundAmount = chartData.reduce((s, d) => s + d.refundAmount, 0)

  return NextResponse.json({
    chartData,
    summary: {
      newSignups: totalNewSignups,
      rebills: totalRebills,
      revenue: totalRevenue,
      signupRevenue: totalSignupRevenue,
      rebillRevenue: totalRebillRevenue,
      refunds: totalRefunds,
      refundAmount: totalRefundAmount,
    },
  })
}
