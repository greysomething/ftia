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

  // Fetch new sign-ups (user_profiles created_at)
  const { data: signups } = await supabase
    .from('user_profiles')
    .select('created_at')
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: true })

  // Fetch payments/rebills (membership_orders)
  const { data: orders } = await supabase
    .from('membership_orders')
    .select('timestamp, total, status')
    .gte('timestamp', sinceISO)
    .in('status', ['success', 'completed', ''])
    .order('timestamp', { ascending: true })

  // Build daily buckets
  const buckets: Record<string, { signups: number; rebills: number; revenue: number }> = {}

  // Initialize all days
  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setDate(d.getDate() - (days - 1 - i))
    const key = d.toISOString().slice(0, 10)
    buckets[key] = { signups: 0, rebills: 0, revenue: 0 }
  }

  // Fill sign-ups
  for (const row of signups ?? []) {
    const key = row.created_at?.slice(0, 10)
    if (key && buckets[key]) {
      buckets[key].signups++
    }
  }

  // Fill rebills
  for (const row of orders ?? []) {
    const key = row.timestamp?.slice(0, 10)
    if (key && buckets[key]) {
      buckets[key].rebills++
      buckets[key].revenue += row.total ?? 0
    }
  }

  const chartData = Object.entries(buckets).map(([date, data]) => ({
    date,
    ...data,
  }))

  // Summary totals
  const totalSignups = chartData.reduce((s, d) => s + d.signups, 0)
  const totalRebills = chartData.reduce((s, d) => s + d.rebills, 0)
  const totalRevenue = chartData.reduce((s, d) => s + d.revenue, 0)

  return NextResponse.json({
    chartData,
    summary: { signups: totalSignups, rebills: totalRebills, revenue: totalRevenue },
  })
}
