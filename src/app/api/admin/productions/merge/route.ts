import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/admin/productions/merge
 * body: {
 *   keptId: number,
 *   mergedId: number,
 *   fields: Record<string, any>   // final values for scalar fields on the kept production
 * }
 *
 * Steps:
 *  1. Snapshot the merged production + all its relations (for undo)
 *  2. Apply scalar field updates to the kept production
 *  3. Move/dedupe relations from merged → kept
 *  4. Re-point analytics + submissions FKs
 *  5. Add slug redirect (mergedSlug → keptSlug)
 *  6. Set merged production visibility = 'trash'  (recoverable)
 *  7. Write production_merge_log row
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await getUser()
  const body = await req.json()
  const keptId = Number(body.keptId)
  const mergedId = Number(body.mergedId)
  const fields = (body.fields ?? {}) as Record<string, any>

  if (!keptId || !mergedId || keptId === mergedId) {
    return NextResponse.json({ error: 'Invalid kept/merged ids' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ── 1. Snapshot the merged production + all relations for undo ─────────────
  const { data: snapshotProd, error: snapErr } = await supabase
    .from('productions')
    .select(`
      *,
      production_type_links(*),
      production_status_links(*),
      production_locations(*),
      production_company_links(*),
      production_crew_roles(*)
    `)
    .eq('id', mergedId)
    .single()

  if (snapErr || !snapshotProd) {
    return NextResponse.json({ error: `Could not load merged production: ${snapErr?.message}` }, { status: 404 })
  }

  const { data: keptProd, error: keptErr } = await supabase
    .from('productions')
    .select('id, slug')
    .eq('id', keptId)
    .single()
  if (keptErr || !keptProd) {
    return NextResponse.json({ error: `Could not load kept production: ${keptErr?.message}` }, { status: 404 })
  }

  // ── 2. Apply scalar field updates to the kept production ────────────────────
  const allowedFields = new Set([
    'title', 'slug', 'content', 'excerpt',
    'production_date_start', 'production_date_end',
    'production_date_startpost', 'production_date_endpost',
    'computed_status',
  ])
  const cleanFields: Record<string, any> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (allowedFields.has(k)) cleanFields[k] = v
  }
  if (Object.keys(cleanFields).length > 0) {
    cleanFields.wp_updated_at = new Date().toISOString()
    const { error: updErr } = await supabase
      .from('productions').update(cleanFields).eq('id', keptId)
    if (updErr) return NextResponse.json({ error: `Update kept failed: ${updErr.message}` }, { status: 500 })
  }

  // ── 3. Merge relations: combine + dedupe ────────────────────────────────────
  // Strategy: for each table, fetch what kept already has, then insert any
  // rows from merged that are NOT already represented (by the relevant key).

  // 3a. production_type_links — composite PK (production_id, type_id)
  {
    const merged = (snapshotProd as any).production_type_links ?? []
    if (merged.length > 0) {
      const { data: existing } = await supabase
        .from('production_type_links').select('type_id').eq('production_id', keptId)
      const existingTypeIds = new Set((existing ?? []).map((r: any) => r.type_id))
      const toInsert = merged
        .filter((r: any) => !existingTypeIds.has(r.type_id))
        .map((r: any) => ({ production_id: keptId, type_id: r.type_id, is_primary: false }))
      if (toInsert.length > 0) {
        await supabase.from('production_type_links').insert(toInsert)
      }
    }
  }

  // 3b. production_status_links — composite PK
  {
    const merged = (snapshotProd as any).production_status_links ?? []
    if (merged.length > 0) {
      const { data: existing } = await supabase
        .from('production_status_links').select('status_id').eq('production_id', keptId)
      const existingStatusIds = new Set((existing ?? []).map((r: any) => r.status_id))
      const toInsert = merged
        .filter((r: any) => !existingStatusIds.has(r.status_id))
        .map((r: any) => ({ production_id: keptId, status_id: r.status_id, is_primary: false }))
      if (toInsert.length > 0) {
        await supabase.from('production_status_links').insert(toInsert)
      }
    }
  }

  // 3c. production_locations — no unique constraint; dedupe by city+stage+country+location
  {
    const merged = (snapshotProd as any).production_locations ?? []
    if (merged.length > 0) {
      const { data: existing } = await supabase
        .from('production_locations').select('location, city, stage, country').eq('production_id', keptId)
      const existingKeys = new Set((existing ?? []).map((r: any) =>
        `${r.location ?? ''}|${r.city ?? ''}|${r.stage ?? ''}|${r.country ?? ''}`))
      const startSort = (existing?.length ?? 0)
      const toInsert = merged
        .filter((r: any) => !existingKeys.has(`${r.location ?? ''}|${r.city ?? ''}|${r.stage ?? ''}|${r.country ?? ''}`))
        .map((r: any, i: number) => ({
          production_id: keptId,
          location: r.location ?? '',
          city: r.city ?? '',
          stage: r.stage ?? '',
          country: r.country ?? '',
          sort_order: startSort + i,
        }))
      if (toInsert.length > 0) {
        await supabase.from('production_locations').insert(toInsert)
      }
    }
  }

  // 3d. production_company_links — dedupe by (company_id) when linked, else by inline_name
  {
    const merged = (snapshotProd as any).production_company_links ?? []
    if (merged.length > 0) {
      const { data: existing } = await supabase
        .from('production_company_links').select('company_id, inline_name').eq('production_id', keptId)
      const existingKeys = new Set((existing ?? []).map((r: any) =>
        r.company_id ? `id:${r.company_id}` : `name:${(r.inline_name ?? '').toLowerCase().trim()}`))
      const startSort = (existing?.length ?? 0)
      const toInsert = merged
        .filter((r: any) => {
          const key = r.company_id ? `id:${r.company_id}` : `name:${(r.inline_name ?? '').toLowerCase().trim()}`
          return key && !existingKeys.has(key)
        })
        .map((r: any, i: number) => ({
          production_id: keptId,
          company_id: r.company_id ?? null,
          inline_name: r.inline_name ?? '',
          inline_address: r.inline_address ?? null,
          inline_phones: r.inline_phones ?? [],
          inline_faxes: r.inline_faxes ?? [],
          inline_emails: r.inline_emails ?? [],
          inline_linkedin: r.inline_linkedin ?? null,
          inline_twitter: r.inline_twitter ?? null,
          inline_instagram: r.inline_instagram ?? null,
          inline_website: r.inline_website ?? null,
          sort_order: startSort + i,
        }))
      if (toInsert.length > 0) {
        await supabase.from('production_company_links').insert(toInsert)
      }
    }
  }

  // 3e. production_crew_roles — dedupe by (crew_id) when linked, else by (role_name + inline_name)
  {
    const merged = (snapshotProd as any).production_crew_roles ?? []
    if (merged.length > 0) {
      const { data: existing } = await supabase
        .from('production_crew_roles').select('crew_id, role_name, inline_name').eq('production_id', keptId)
      const existingKeys = new Set((existing ?? []).map((r: any) =>
        r.crew_id ? `id:${r.crew_id}` : `name:${(r.role_name ?? '').toLowerCase().trim()}|${(r.inline_name ?? '').toLowerCase().trim()}`))
      const startSort = (existing?.length ?? 0)
      const toInsert = merged
        .filter((r: any) => {
          const key = r.crew_id ? `id:${r.crew_id}` : `name:${(r.role_name ?? '').toLowerCase().trim()}|${(r.inline_name ?? '').toLowerCase().trim()}`
          return key && !existingKeys.has(key)
        })
        .map((r: any, i: number) => ({
          production_id: keptId,
          crew_id: r.crew_id ?? null,
          role_name: r.role_name ?? '',
          inline_name: r.inline_name ?? '',
          inline_phones: r.inline_phones ?? [],
          inline_emails: r.inline_emails ?? [],
          inline_linkedin: r.inline_linkedin ?? null,
          inline_twitter: r.inline_twitter ?? null,
          inline_instagram: r.inline_instagram ?? null,
          inline_website: r.inline_website ?? null,
          sort_order: startSort + i,
        }))
      if (toInsert.length > 0) {
        await supabase.from('production_crew_roles').insert(toInsert)
      }
    }
  }

  // ── 4. Re-point analytics + submissions FKs ────────────────────────────────
  // search_clicks: just re-point
  await supabase.from('search_clicks').update({ production_id: keptId }).eq('production_id', mergedId)

  // production_week_entries: UNIQUE(production_id, week_monday) — handle conflicts
  {
    const { data: mergedWeeks } = await supabase
      .from('production_week_entries').select('week_monday').eq('production_id', mergedId)
    if (mergedWeeks && mergedWeeks.length > 0) {
      const { data: keptWeeks } = await supabase
        .from('production_week_entries').select('week_monday').eq('production_id', keptId)
      const keptSet = new Set((keptWeeks ?? []).map((r: any) => r.week_monday))
      // Move only the rows that don't conflict, then delete the rest
      for (const w of mergedWeeks) {
        if (keptSet.has(w.week_monday)) continue
        await supabase.from('production_week_entries')
          .update({ production_id: keptId })
          .eq('production_id', mergedId).eq('week_monday', w.week_monday)
      }
      // Delete any leftover (conflicting) rows on merged
      await supabase.from('production_week_entries').delete().eq('production_id', mergedId)
    }
  }

  // production_submissions.published_production_id: re-point if any
  await supabase.from('production_submissions')
    .update({ published_production_id: keptId })
    .eq('published_production_id', mergedId)

  // blog_generation_queue: UNIQUE(production_id) — if merged has one and kept doesn't, transfer; else delete merged's
  {
    const { data: mergedBlog } = await supabase
      .from('blog_generation_queue').select('id').eq('production_id', mergedId).maybeSingle()
    if (mergedBlog) {
      const { data: keptBlog } = await supabase
        .from('blog_generation_queue').select('id').eq('production_id', keptId).maybeSingle()
      if (!keptBlog) {
        await supabase.from('blog_generation_queue').update({ production_id: keptId }).eq('id', mergedBlog.id)
      } else {
        await supabase.from('blog_generation_queue').delete().eq('id', mergedBlog.id)
      }
    }
  }

  // ── 5. Add slug redirect (only if slugs differ) ─────────────────────────────
  const finalKeptSlug = cleanFields.slug ?? keptProd.slug
  const mergedSlug = (snapshotProd as any).slug
  if (mergedSlug && mergedSlug !== finalKeptSlug) {
    await supabase.from('slug_redirects').upsert({
      entity_type: 'production',
      old_slug: mergedSlug,
      new_slug: finalKeptSlug,
      created_by: user?.id ?? null,
    }, { onConflict: 'entity_type,old_slug' })
  }

  // ── 6. Move merged production to trash (recoverable) ────────────────────────
  await supabase.from('productions').update({
    visibility: 'trash',
    wp_updated_at: new Date().toISOString(),
  }).eq('id', mergedId)

  // ── 7. Write merge log for undo ────────────────────────────────────────────
  const { data: logRow } = await supabase.from('production_merge_log').insert({
    kept_id: keptId,
    merged_id: mergedId,
    merged_snapshot: snapshotProd,
    field_choices: cleanFields,
    merged_by: user?.id ?? null,
  }).select('id').single()

  // ── Revalidate ─────────────────────────────────────────────────────────────
  revalidatePath('/admin/productions')
  revalidatePath(`/admin/productions/${keptId}/edit`)
  revalidatePath(`/production/${finalKeptSlug}`)
  if (mergedSlug && mergedSlug !== finalKeptSlug) {
    revalidatePath(`/production/${mergedSlug}`)
  }

  return NextResponse.json({
    ok: true,
    keptId,
    keptSlug: finalKeptSlug,
    mergedId,
    mergedSlug,
    logId: logRow?.id,
  })
}
