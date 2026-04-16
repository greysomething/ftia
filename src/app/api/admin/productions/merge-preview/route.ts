import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Scalar production fields the admin may need to pick between when both
// productions have a non-empty value that differs.
const PICKABLE_FIELDS = [
  'title', 'slug', 'content', 'excerpt',
  'production_date_start', 'production_date_end',
  'production_date_startpost', 'production_date_endpost',
  'computed_status',
] as const

export async function GET(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const idsParam = req.nextUrl.searchParams.get('ids') ?? ''
  const ids = idsParam.split(',').map(s => Number(s.trim())).filter(Boolean)
  if (ids.length !== 2) {
    return NextResponse.json({ error: 'Provide exactly 2 ids' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: productions, error } = await supabase
    .from('productions')
    .select(`
      *,
      production_type_links(is_primary, type_id, production_types(id, name)),
      production_status_links(is_primary, status_id, production_statuses(id, name)),
      production_locations(id, location, city, stage, country, sort_order),
      production_company_links(*),
      production_crew_roles(*)
    `)
    .in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!productions || productions.length !== 2) {
    return NextResponse.json({ error: 'One or both productions not found' }, { status: 404 })
  }

  // Order them in the same sequence the caller asked for
  const ordered = ids.map(id => productions.find(p => p.id === id)!).filter(Boolean)

  // Identify scalar field conflicts (both have a value, and they differ)
  const conflicts: Array<{ field: string; values: [any, any] }> = []
  const autoMerged: Record<string, any> = {}
  for (const f of PICKABLE_FIELDS) {
    const a = (ordered[0] as any)[f]
    const b = (ordered[1] as any)[f]
    const aHas = a !== null && a !== undefined && String(a).trim() !== ''
    const bHas = b !== null && b !== undefined && String(b).trim() !== ''

    if (aHas && bHas && String(a) !== String(b)) {
      conflicts.push({ field: f, values: [a, b] })
    } else {
      autoMerged[f] = aHas ? a : (bHas ? b : null)
    }
  }

  return NextResponse.json({
    ok: true,
    productions: ordered,
    conflicts,
    autoMerged,
    pickableFields: PICKABLE_FIELDS,
  })
}
