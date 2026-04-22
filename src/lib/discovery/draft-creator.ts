/**
 * Convert an ExtractedProduction into a real draft `productions` row plus
 * its relations (types, statuses, locations, companies, crew).
 *
 * Returns the new production id and slug. Tolerates missing tables/IDs —
 * any link that can't resolve is silently skipped (admin will see it as
 * empty in the edit form and can fix it).
 */

import type { createAdminClient } from '@/lib/supabase/server'
import type { ExtractedProduction } from './extractor'
import { slugify } from '@/lib/utils'

export async function createDraftFromExtraction(
  supabase: ReturnType<typeof createAdminClient>,
  ext: ExtractedProduction,
  meta: { sourceLink?: string | null; sourceName?: string | null },
): Promise<{ productionId: number; slug: string }> {
  // Build an HTML "Notes" block at the bottom of content so admins see
  // exactly what the AI extracted, with sources, before publishing.
  const sourceTag = meta.sourceName
    ? `<p><em>Auto-imported from ${meta.sourceName}${meta.sourceLink ? ` — <a href="${meta.sourceLink}" target="_blank" rel="noopener">source article</a>` : ''}</em></p>`
    : ''

  const fieldSourceLines = Object.entries(ext.field_sources).map(([field, info]) => {
    const conf = Math.round((info?.confidence ?? 0) * 100)
    const source = info?.source ?? '—'
    return `<li><strong>${field}:</strong> ${conf}% — ${source}</li>`
  }).join('')

  const notesBlock = [
    sourceTag,
    `<p><strong>AI extraction notes (verifiability ${ext.verifiability_score}/100):</strong> ${ext.notes || ''}</p>`,
    fieldSourceLines ? `<details><summary>Field sources</summary><ul>${fieldSourceLines}</ul></details>` : '',
    ext.searched_but_not_found.length > 0 ? `<p><em>Searched but not found:</em> ${ext.searched_but_not_found.join(', ')}</p>` : '',
  ].filter(Boolean).join('\n')

  // Make the slug unique (productions has a unique slug constraint)
  const baseSlug = slugify(ext.title)
  let slug = baseSlug
  for (let suffix = 2; suffix <= 20; suffix++) {
    const { data: collision } = await supabase
      .from('productions').select('id').eq('slug', slug).maybeSingle()
    if (!collision) break
    slug = `${baseSlug}-${suffix}`
  }

  // Insert the production row
  const { data: prod, error: insertErr } = await supabase
    .from('productions')
    .insert({
      title: ext.title,
      slug,
      visibility: 'draft',
      content: notesBlock,
      excerpt: ext.excerpt,
      computed_status: ext.production_phase,
      production_date_start: ext.production_date_start,
      production_date_end: ext.production_date_end,
      wp_updated_at: new Date().toISOString(),
    })
    .select('id, slug')
    .single()

  if (insertErr || !prod) throw new Error(`Failed to create production: ${insertErr?.message}`)
  const productionId = prod.id

  // Resolve & link production_type_slug
  if (ext.production_type_slug) {
    const { data: type } = await supabase
      .from('production_types').select('id').eq('slug', ext.production_type_slug).maybeSingle()
    if (type) {
      await supabase.from('production_type_links').insert({
        production_id: productionId, type_id: type.id, is_primary: true,
      })
    }
  }

  // Resolve & link production_status_slug
  if (ext.production_status_slug) {
    const { data: status } = await supabase
      .from('production_statuses').select('id').eq('slug', ext.production_status_slug).maybeSingle()
    if (status) {
      await supabase.from('production_status_links').insert({
        production_id: productionId, status_id: status.id, is_primary: true,
      })
    }
  }

  // Locations
  if (ext.locations.length > 0) {
    await supabase.from('production_locations').insert(
      ext.locations.map((l, i) => ({
        production_id: productionId,
        city: l.city ?? '',
        location: l.location ?? '',
        country: l.country ?? '',
        stage: '',
        sort_order: i,
      })),
    )
  }

  // Companies
  if (ext.companies.length > 0) {
    await supabase.from('production_company_links').insert(
      ext.companies.map((c, i) => ({
        production_id: productionId,
        inline_name: c.inline_name,
        inline_address: c.inline_address ?? null,
        inline_phones: [],
        inline_faxes: [],
        inline_emails: [],
        sort_order: i,
      })),
    )
  }

  // Crew
  if (ext.crew.length > 0) {
    await supabase.from('production_crew_roles').insert(
      ext.crew.map((c, i) => ({
        production_id: productionId,
        role_name: c.role_name,
        inline_name: c.inline_name,
        inline_phones: [],
        inline_emails: [],
        sort_order: i,
      })),
    )
  }

  return { productionId, slug: prod.slug }
}
