import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/admin/weekly-entry?q=search_term
 * Search productions to add to a weekly list.
 */
export async function GET(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = req.nextUrl.searchParams.get('q') ?? ''
  if (!q.trim()) {
    return NextResponse.json({ productions: [] })
  }

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('productions')
    .select('id, title, slug, visibility')
    .ilike('title', `%${q}%`)
    .order('title')
    .limit(15)

  return NextResponse.json({ productions: data ?? [] })
}

/**
 * POST /api/admin/weekly-entry
 * Add a production to a weekly list.
 * Body: { productionId: number, weekMonday: string }
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { productionId, weekMonday } = await req.json()
  if (!productionId || !weekMonday) {
    return NextResponse.json({ error: 'Missing productionId or weekMonday' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await (supabase as any)
    .from('production_week_entries')
    .upsert(
      { production_id: productionId, week_monday: weekMonday },
      { onConflict: 'production_id,week_monday' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: 'Production added to weekly list.' })
}

/**
 * DELETE /api/admin/weekly-entry
 * Remove a production from a weekly list.
 * Body: { entryId: number }
 */
export async function DELETE(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { entryId } = await req.json()
  if (!entryId) {
    return NextResponse.json({ error: 'Missing entryId' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('production_week_entries')
    .delete()
    .eq('id', entryId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: 'Production removed from weekly list.' })
}
