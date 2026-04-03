import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET — fetch queue with production info + stats
export async function GET(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const status = url.searchParams.get('status') // filter by status
  const page = parseInt(url.searchParams.get('page') || '1', 10)
  const perPage = 20

  const supabase = createAdminClient()

  // Build query
  let query = supabase
    .from('blog_generation_queue')
    .select('*, productions!inner(id, title, computed_status)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get stats
  const { data: statsData } = await supabase
    .from('blog_generation_queue')
    .select('status')

  const stats = {
    pending: 0, generating: 0, completed: 0, failed: 0, skipped: 0, total: 0,
  }
  for (const row of statsData ?? []) {
    stats[row.status as keyof typeof stats] = (stats[row.status as keyof typeof stats] || 0) + 1
    stats.total++
  }

  return NextResponse.json({ items: data ?? [], total: count ?? 0, perPage, stats })
}

// POST — add productions to queue (manual or auto-populate)
export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { action, productionIds } = await req.json() as {
    action: 'add' | 'populate' | 'retry-failed' | 'clear-completed'
    productionIds?: number[]
  }

  const supabase = createAdminClient()

  if (action === 'add' && productionIds?.length) {
    // Add specific productions to queue
    const rows = productionIds.map(id => ({ production_id: id, status: 'pending' as const }))
    const { error } = await supabase
      .from('blog_generation_queue')
      .upsert(rows, { onConflict: 'production_id', ignoreDuplicates: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, added: rows.length })
  }

  if (action === 'populate') {
    // Auto-populate: find productions that don't have blog posts yet
    // and aren't already in the queue
    const { data: settings } = await supabase
      .from('blog_generation_settings')
      .select('key, value')

    const settingsMap: Record<string, string> = {}
    for (const s of settings ?? []) settingsMap[s.key] = s.value
    const minScore = parseInt(settingsMap.min_production_data_score || '3', 10)
    const excludeTypes: string[] = JSON.parse(settingsMap.exclude_types || '[]')

    // Get productions that already have blog posts or are in the queue
    const { data: existingQueue } = await supabase
      .from('blog_generation_queue')
      .select('production_id')
    const queuedIds = new Set((existingQueue ?? []).map((q: any) => q.production_id))

    const { data: linkedBlog } = await supabase
      .from('productions')
      .select('id')
      .not('blog_linked', 'is', null)
    const linkedIds = new Set((linkedBlog ?? []).map((p: any) => p.id))

    // Fetch eligible productions (recent, with enough data)
    let prodQuery = supabase
      .from('productions')
      .select(`
        id, title, excerpt, content, computed_status,
        production_date_start, production_date_end,
        production_crew_roles(id),
        production_company_links(id),
        production_locations(id),
        production_type_links(production_types(name))
      `)
      .order('updated_at', { ascending: false })
      .limit(200)

    const { data: productions } = await prodQuery

    // Score each production and filter
    const candidates: { production_id: number; score: number }[] = []
    for (const p of productions ?? []) {
      if (queuedIds.has(p.id) || linkedIds.has(p.id)) continue

      // Check excluded types
      const typeNames = (p.production_type_links as any[])?.map(
        (tm: any) => tm.production_types?.name
      ).filter(Boolean) ?? []
      if (excludeTypes.length && typeNames.some((t: string) => excludeTypes.includes(t))) continue

      // Score based on data richness
      let score = 0
      if (p.title) score++
      if (p.excerpt) score++
      if (p.content) score++
      if (p.computed_status) score++
      if ((p.production_crew_roles as any[])?.length > 0) score++
      if ((p.production_company_links as any[])?.length > 0) score++
      if ((p.production_locations as any[])?.length > 0) score++
      if (p.production_date_start) score++

      if (score >= minScore) {
        candidates.push({ production_id: p.id, score })
      }
    }

    // Sort by score descending, take top ones
    candidates.sort((a, b) => b.score - a.score)
    const toAdd = candidates.slice(0, 50)

    if (toAdd.length > 0) {
      const rows = toAdd.map(c => ({ production_id: c.production_id, status: 'pending' as const }))
      const { error } = await supabase
        .from('blog_generation_queue')
        .upsert(rows, { onConflict: 'production_id', ignoreDuplicates: true })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, added: toAdd.length })
  }

  if (action === 'retry-failed') {
    const { error } = await supabase
      .from('blog_generation_queue')
      .update({ status: 'pending', error: null, attempts: 0 })
      .eq('status', 'failed')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'clear-completed') {
    const { error } = await supabase
      .from('blog_generation_queue')
      .delete()
      .eq('status', 'completed')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
