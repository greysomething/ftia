import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/productions/merge-undo
 * body: { logId: number }
 *
 * Undoes a merge by:
 *  1. Restoring the merged production from trash (visibility from snapshot)
 *  2. Re-creating any relations on the merged production (best-effort)
 *  3. Removing the slug redirect that points old → new
 *  4. Marking the log row as undone
 *
 * Note: this does NOT remove the relations that were merged INTO the kept
 * production — that would require tracking which exact rows were inserted.
 * Admins should review the kept production after undo and remove duplicates
 * if needed. We surface this caveat in the UI.
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await getUser()
  const { logId } = await req.json()
  if (!logId) return NextResponse.json({ error: 'logId required' }, { status: 400 })

  const supabase = createAdminClient()

  const { data: log, error: logErr } = await supabase
    .from('production_merge_log')
    .select('*')
    .eq('id', logId)
    .single()

  if (logErr || !log) {
    return NextResponse.json({ error: 'Merge log not found' }, { status: 404 })
  }
  if (log.undone_at) {
    return NextResponse.json({ error: 'This merge has already been undone' }, { status: 400 })
  }

  const snapshot = log.merged_snapshot as any
  const mergedId = log.merged_id
  const mergedSlug: string | null = snapshot?.slug ?? null

  // 1. Restore the merged production's visibility (and any other top-level fields
  // from the snapshot that may have changed). We're conservative: only restore
  // visibility — the rest of the data was unchanged on the trashed row.
  const restoredVisibility = snapshot?.visibility ?? 'draft'
  await supabase.from('productions').update({
    visibility: restoredVisibility,
    wp_updated_at: new Date().toISOString(),
  }).eq('id', mergedId)

  // 2. Re-create relations from the snapshot.
  // We only insert if the row no longer exists (the original cascade left it intact
  // on the trashed production, but if anyone manually purged or moved them, this
  // restores from snapshot).
  const relationTables: Array<{ table: string; rows: any[]; stripFields?: string[] }> = [
    { table: 'production_type_links', rows: snapshot?.production_type_links ?? [] },
    { table: 'production_status_links', rows: snapshot?.production_status_links ?? [] },
    { table: 'production_locations', rows: snapshot?.production_locations ?? [], stripFields: ['id'] },
    { table: 'production_company_links', rows: snapshot?.production_company_links ?? [], stripFields: ['id'] },
    { table: 'production_crew_roles', rows: snapshot?.production_crew_roles ?? [], stripFields: ['id'] },
  ]

  for (const { table, rows, stripFields } of relationTables) {
    if (!rows || rows.length === 0) continue
    const { data: existing } = await supabase
      .from(table).select('*', { count: 'exact', head: true }).eq('production_id', mergedId)
    if ((existing as any)?.length > 0) continue // already there
    const cleaned = rows.map((r: any) => {
      const copy = { ...r }
      for (const f of (stripFields ?? [])) delete copy[f]
      copy.production_id = mergedId
      return copy
    })
    await supabase.from(table).insert(cleaned)
  }

  // 3. Remove slug redirect if it was created for this merge
  if (mergedSlug) {
    await supabase.from('slug_redirects')
      .delete()
      .eq('entity_type', 'production')
      .eq('old_slug', mergedSlug)
  }

  // 4. Mark log as undone
  await supabase.from('production_merge_log').update({
    undone_at: new Date().toISOString(),
    undone_by: user?.id ?? null,
  }).eq('id', logId)

  // Revalidate
  revalidatePath('/admin/productions')
  revalidatePath(`/admin/productions/${mergedId}/edit`)
  revalidatePath(`/admin/productions/${log.kept_id}/edit`)
  if (mergedSlug) revalidatePath(`/production/${mergedSlug}`)

  return NextResponse.json({
    ok: true,
    restoredId: mergedId,
    restoredSlug: mergedSlug,
    note: 'The merged production is restored. Relations that were combined into the kept production were NOT removed — review the kept production for any duplicate rows you want to delete.',
  })
}
