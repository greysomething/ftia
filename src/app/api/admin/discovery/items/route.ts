import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const PER_PAGE = 25

export async function GET(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const status = req.nextUrl.searchParams.get('status')  // optional filter
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10))
  const q = req.nextUrl.searchParams.get('q')?.trim()

  const supabase = createAdminClient()
  let query = supabase
    .from('discovery_items')
    .select('*, discovery_sources(name, url)', { count: 'exact' })

  if (status && status !== 'all') query = query.eq('status', status)
  if (q) query = query.ilike('title', `%${q}%`)

  query = query.order('created_at', { ascending: false }).range((page - 1) * PER_PAGE, page * PER_PAGE - 1)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Counts by status for the tab bar
  const { data: statusCounts } = await supabase.rpc('discovery_status_counts').select('*')
  // If RPC doesn't exist (we haven't defined one), fall back to per-status selects
  let counts: Record<string, number> = {}
  if (statusCounts && Array.isArray(statusCounts)) {
    for (const row of statusCounts as any[]) counts[row.status] = row.count
  } else {
    const statuses = ['new','filtered_out','duplicate','extracted','created','error','skipped','extracting']
    await Promise.all(statuses.map(async s => {
      const { count: c } = await supabase.from('discovery_items').select('*', { count: 'exact', head: true }).eq('status', s)
      counts[s] = c ?? 0
    }))
  }

  return NextResponse.json({
    items: data ?? [],
    total: count ?? 0,
    perPage: PER_PAGE,
    page,
    counts,
  })
}
