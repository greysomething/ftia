'use server'

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { slugify } from '@/lib/utils'
import { addProductionToCurrentWeek } from '@/lib/queries'

export async function saveProduction(prevState: any, formData: FormData) {
  await requireAdmin()
  const supabase = createAdminClient()

  const id = formData.get('id') ? Number(formData.get('id')) : null
  const title = String(formData.get('title') ?? '').trim()
  let slug = String(formData.get('slug') ?? '').trim() || slugify(title)
  const visibility = String(formData.get('visibility') ?? 'publish')

  // Ensure slug is unique (append -2, -3, etc. if collision)
  if (!id) {
    const { data: existingSlug } = await supabase
      .from('productions')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (existingSlug) {
      let suffix = 2
      while (true) {
        const candidate = `${slug}-${suffix}`
        const { data: collision } = await supabase
          .from('productions')
          .select('id')
          .eq('slug', candidate)
          .maybeSingle()
        if (!collision) { slug = candidate; break }
        suffix++
        if (suffix > 20) { slug = `${slug}-${Date.now()}`; break }
      }
    }
  }
  const content = String(formData.get('content') ?? '') || null
  const excerpt = String(formData.get('excerpt') ?? '') || null
  const production_date_start = (formData.get('production_date_start') as string) || null
  const production_date_end = (formData.get('production_date_end') as string) || null
  const production_date_startpost = (formData.get('production_date_startpost') as string) || null
  const production_date_endpost = (formData.get('production_date_endpost') as string) || null
  const computed_status = (formData.get('computed_status') as string) || null

  if (!title) return { error: 'Title is required.' }

  const row: Record<string, any> = {
    title, slug, visibility, content, excerpt,
    production_date_start, production_date_end,
    production_date_startpost, production_date_endpost,
    computed_status,
    wp_updated_at: new Date().toISOString(),
  }

  let productionId = id

  if (id) {
    const { error } = await supabase.from('productions').update(row).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { data, error } = await supabase.from('productions').insert(row).select('id').single()
    if (error) {
      if (error.message.includes('productions_slug_key')) {
        return { error: `A production with the URL slug "${slug}" already exists. Try changing the title slightly or editing the existing production instead.` }
      }
      return { error: error.message }
    }
    productionId = data.id
  }

  // --- Save production type links ---
  const typeIds = formData.getAll('type_ids').map(Number).filter(Boolean)
  const primaryTypeId = Number(formData.get('primary_type_id')) || null

  // Delete existing links, then re-insert
  await supabase.from('production_type_links').delete().eq('production_id', productionId!)
  if (typeIds.length > 0) {
    await supabase.from('production_type_links').insert(
      typeIds.map(tid => ({
        production_id: productionId!,
        type_id: tid,
        is_primary: tid === primaryTypeId,
      }))
    )
  }

  // --- Save production status links ---
  const statusIds = formData.getAll('status_ids').map(Number).filter(Boolean)
  const primaryStatusId = Number(formData.get('primary_status_id')) || null

  await supabase.from('production_status_links').delete().eq('production_id', productionId!)
  if (statusIds.length > 0) {
    await supabase.from('production_status_links').insert(
      statusIds.map(sid => ({
        production_id: productionId!,
        status_id: sid,
        is_primary: sid === primaryStatusId,
      }))
    )
  }

  // --- Save locations ---
  const locationJson = formData.get('locations_json') as string
  await supabase.from('production_locations').delete().eq('production_id', productionId!)
  if (locationJson) {
    try {
      const locations = JSON.parse(locationJson) as Array<{
        location: string; city: string; stage: string; country: string
      }>
      if (locations.length > 0) {
        await supabase.from('production_locations').insert(
          locations.map((loc, i) => ({
            production_id: productionId!,
            location: loc.location || '',
            city: loc.city || '',
            stage: loc.stage || '',
            country: loc.country || '',
            sort_order: i,
          }))
        )
      }
    } catch { /* ignore bad JSON */ }
  }

  // --- Save crew roles ---
  const crewJson = formData.get('crew_json') as string
  await supabase.from('production_crew_roles').delete().eq('production_id', productionId!)
  if (crewJson) {
    try {
      const crew = JSON.parse(crewJson) as Array<{
        role_name: string; inline_name: string; crew_id?: number | null
        inline_phones?: string[]; inline_emails?: string[]; inline_linkedin?: string
      }>
      if (crew.length > 0) {
        await supabase.from('production_crew_roles').insert(
          crew.map((c, i) => ({
            production_id: productionId!,
            role_name: c.role_name || '',
            inline_name: c.inline_name || '',
            crew_id: c.crew_id || null,
            inline_phones: c.inline_phones || [],
            inline_emails: c.inline_emails || [],
            inline_linkedin: c.inline_linkedin || null,
            sort_order: i,
          }))
        )
      }
    } catch { /* ignore bad JSON */ }
  }

  // --- Save company links ---
  const companiesJson = formData.get('companies_json') as string
  await supabase.from('production_company_links').delete().eq('production_id', productionId!)
  if (companiesJson) {
    try {
      const companies = JSON.parse(companiesJson) as Array<{
        inline_name: string; inline_address?: string; company_id?: number | null
        inline_phones?: string[]; inline_faxes?: string[]; inline_emails?: string[]
        inline_linkedin?: string
      }>
      if (companies.length > 0) {
        await supabase.from('production_company_links').insert(
          companies.map((c, i) => ({
            production_id: productionId!,
            inline_name: c.inline_name || '',
            inline_address: c.inline_address || null,
            company_id: c.company_id || null,
            inline_phones: c.inline_phones || [],
            inline_faxes: c.inline_faxes || [],
            inline_emails: c.inline_emails || [],
            inline_linkedin: c.inline_linkedin || null,
            sort_order: i,
          }))
        )
      }
    } catch { /* ignore bad JSON */ }
  }

  // Auto-add to current week's list
  if (productionId && visibility === 'publish') {
    await addProductionToCurrentWeek(productionId).catch(() => {})
  }

  revalidatePath('/admin/productions')
  revalidatePath('/productions')
  revalidatePath('/admin/weekly-lists')
  if (productionId) revalidatePath(`/production/${slug}`)
  redirect('/admin/productions')
}

export async function deleteProduction(id: number) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('productions').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/productions')
  revalidatePath('/productions')
}
