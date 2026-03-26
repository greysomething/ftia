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

  // 1. Fetch ALL successful orders for users who have orders in this period
  //    We need the full history to know each user's first-ever order (= sign-up)
  const ordersInRange: Array<{ user_id: string; timestamp: string; total: number }> = []
  let page = 0
  while (true) {
    const from = page * 1000
    const { data } = await supabase
      .from('membership_orders')
      .select('user_id, timestamp, total')
      .gte('timestamp', sinceISO)
      .eq('status', 'success')
      .order('timestamp', { ascending: true })
      .range(from, from + 999)
    if (!data || data.length === 0) break
    ordersInRange.push(...data)
    if (data.length < 1000) break
    page++
  }

  // 2. For each user with orders in this range, find their first-ever order date
  //    to determine if an order in-range is a new sign-up or a rebill
  const userIds = [...new Set(ordersInRange.map(o => o.user_id))]

  const firstOrderMap: Record<string, string> = {} // user_id -> first order timestamp

  // Batch fetch first orders for these users
  for (let i = 0; i < userIds.length; i += 100) {
    const batch = userIds.slice(i, i + 100)
    const { data } = await supabase
      .from('membership_orders')
      .select('user_id, timestamp')
      .in('user_id', batch)
      .eq('status', 'success')
      .order('timestamp', { ascending: true })

    for (const row of data ?? []) {
      // Keep only the earliest timestamp per user
      if (!firstOrderMap[row.user_id] || row.timestamp < firstOrderMap[row.user_id]) {
        firstOrderMap[row.user_id] = row.timestamp
      }
    }
  }

  // 3. Build daily buckets
  const buckets: Record<string, { newSignups: number; rebills: number; signupRevenue: number; rebillRevenue: number; revenue: number }> = {}

  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setDate(d.getDate() - (days - 1 - i))
    const key = d.toISOString().slice(0, 10)
    buckets[key] = { newSignups: 0, rebills: 0, signupRevenue: 0, rebillRevenue: 0, revenue: 0 }
  }

  // 4. Categorize each order: if it's the user's first-ever order, it's a new sign-up
  for (const order of ordersInRange) {
    const key = order.timestamp?.slice(0, 10)
    if (!key || !buckets[key]) continue

    const firstOrderDate = firstOrderMap[order.user_id]?.slice(0, 10)
    const isNewSignup = firstOrderDate === key

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
