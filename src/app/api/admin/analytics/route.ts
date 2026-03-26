import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const days = parseInt(searchParams.get('days') ?? '30', 10)

  const supabase = createAdminClient()
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceISO = since.toISOString()

  // Fetch all successful orders in the date range
  const ordersInRange: Array<{
    user_id: string
    timestamp: string
    total: number
    billing_reason: string | null
  }>[] = []
  const allOrders: Array<{
    user_id: string
    timestamp: string
    total: number
    billing_reason: string | null
  }> = []

  let page = 0
  while (true) {
    const from = page * 1000
    const { data } = await supabase
      .from('membership_orders')
      .select('user_id, timestamp, total, billing_reason')
      .gte('timestamp', sinceISO)
      .eq('status', 'success')
      .order('timestamp', { ascending: true })
      .range(from, from + 999)
    if (!data || data.length === 0) break
    allOrders.push(...data)
    if (data.length < 1000) break
    page++
  }

  // For orders missing billing_reason, fall back to first-order heuristic
  const usersNeedingLookup = new Set<string>()
  for (const order of allOrders) {
    if (!order.billing_reason) {
      usersNeedingLookup.add(order.user_id)
    }
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

  // Build daily buckets
  const buckets: Record<string, {
    newSignups: number; rebills: number
    signupRevenue: number; rebillRevenue: number; revenue: number
  }> = {}

  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setDate(d.getDate() - (days - 1 - i))
    const key = d.toISOString().slice(0, 10)
    buckets[key] = { newSignups: 0, rebills: 0, signupRevenue: 0, rebillRevenue: 0, revenue: 0 }
  }

  // Categorize each order
  for (const order of allOrders) {
    const key = order.timestamp?.slice(0, 10)
    if (!key || !buckets[key]) continue

    let isNewSignup: boolean
    if (order.billing_reason) {
      // Use the authoritative billing_reason from Stripe
      isNewSignup = order.billing_reason === 'subscription_create'
    } else {
      // Fallback: compare to user's first-ever order date
      const firstOrderDate = firstOrderMap[order.user_id]?.slice(0, 10)
      isNewSignup = firstOrderDate === key
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

  const chartData = Object.entries(buckets).map(([date, data]) => ({
    date,
    ...data,
  }))

  const totalNewSignups = chartData.reduce((s, d) => s + d.newSignups, 0)
  const totalRebills = chartData.reduce((s, d) => s + d.rebills, 0)
  const totalRevenue = chartData.reduce((s, d) => s + d.revenue, 0)
  const totalSignupRevenue = chartData.reduce((s, d) => s + d.signupRevenue, 0)
  const totalRebillRevenue = chartData.reduce((s, d) => s + d.rebillRevenue, 0)

  return NextResponse.json({
    chartData,
    summary: {
      newSignups: totalNewSignups,
      rebills: totalRebills,
      revenue: totalRevenue,
      signupRevenue: totalSignupRevenue,
      rebillRevenue: totalRebillRevenue,
    },
  })
}
