'use server'

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function adminSavePitch(prevState: any, formData: FormData) {
  await requireAdmin()
  const supabase = createAdminClient()

  const id = formData.get('id') ? Number(formData.get('id')) : null
  const title = String(formData.get('title') ?? '').trim()
  const logline = String(formData.get('logline') ?? '').trim()
  const synopsis = String(formData.get('synopsis') ?? '').trim() || null
  const format = String(formData.get('format') ?? 'feature-film')
  const budgetRange = String(formData.get('budget_range') ?? '').trim() || null
  const developmentStage = String(formData.get('development_stage') ?? 'concept')
  const targetAudience = String(formData.get('target_audience') ?? '').trim() || null
  const comparableTitles = String(formData.get('comparable_titles') ?? '').trim() || null
  const uniqueSellingPoints = String(formData.get('unique_selling_points') ?? '').trim() || null
  const visibility = String(formData.get('visibility') ?? 'draft') as 'draft' | 'publish' | 'private'
  const featured = formData.get('featured') === 'on' || formData.get('featured') === 'true'

  // Parse genre IDs
  let genreIds: number[] = []
  try { genreIds = JSON.parse(formData.get('genre_ids') as string ?? '[]') } catch {}

  // Validation
  if (!title) return { error: 'Title is required.' }
  if (!logline) return { error: 'Logline is required.' }
  if (logline.length > 300) return { error: 'Logline must be 300 characters or less.' }

  // Generate slug
  let slug = String(formData.get('slug') ?? '').trim() || slugify(title)

  // Ensure slug uniqueness
  const slugQuery = supabase.from('pitches').select('id').eq('slug', slug)
  if (id) slugQuery.neq('id', id)
  const { data: existingSlug } = await slugQuery.maybeSingle()
  if (existingSlug) {
    let suffix = 2
    while (true) {
      const candidate = `${slug}-${suffix}`
      const checkQuery = supabase.from('pitches').select('id').eq('slug', candidate)
      if (id) checkQuery.neq('id', id)
      const { data: collision } = await checkQuery.maybeSingle()
      if (!collision) { slug = candidate; break }
      suffix++
      if (suffix > 20) { slug = `${slug}-${Date.now()}`; break }
    }
  }

  const row: Record<string, any> = {
    title,
    slug,
    logline,
    synopsis,
    format,
    budget_range: budgetRange,
    development_stage: developmentStage,
    target_audience: targetAudience,
    comparable_titles: comparableTitles,
    unique_selling_points: uniqueSellingPoints,
    visibility,
    featured,
  }

  // Set published_at when publishing
  if (visibility === 'publish') {
    if (id) {
      const { data: current } = await supabase
        .from('pitches')
        .select('published_at')
        .eq('id', id)
        .single()
      if (!current?.published_at) {
        row.published_at = new Date().toISOString()
      }
    } else {
      row.published_at = new Date().toISOString()
    }
  }

  let pitchId: number

  if (id) {
    const { error } = await supabase.from('pitches').update(row).eq('id', id)
    if (error) return { error: error.message }
    pitchId = id
  } else {
    const { data: newPitch, error } = await supabase
      .from('pitches')
      .insert(row)
      .select('id')
      .single()
    if (error) return { error: error.message }
    pitchId = newPitch.id
  }

  // Manage genre links
  await supabase.from('pitch_genre_links').delete().eq('pitch_id', pitchId)
  if (genreIds.length > 0) {
    const links = genreIds.map((genreId, i) => ({
      pitch_id: pitchId,
      genre_id: genreId,
      is_primary: i === 0,
    }))
    await supabase.from('pitch_genre_links').insert(links)
  }

  revalidatePath('/admin/pitches')
  revalidatePath('/pitches')
  redirect(`/admin/pitches/${pitchId}/edit`)
}

export async function adminDeletePitch(id: number) {
  await requireAdmin()
  const supabase = createAdminClient()

  // Delete attachments from storage first
  const { data: attachments } = await supabase
    .from('pitch_attachments')
    .select('id, storage_path')
    .eq('pitch_id', id)

  if (attachments && attachments.length > 0) {
    const paths = attachments
      .map((a: any) => a.storage_path)
      .filter(Boolean)
    if (paths.length > 0) {
      await supabase.storage.from('media').remove(paths)
    }
    // Delete attachment records
    await supabase.from('pitch_attachments').delete().eq('pitch_id', id)
  }

  // Delete the pitch (cascades to genre links, favorites)
  const { error } = await supabase.from('pitches').delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/pitches')
  revalidatePath('/pitches')
}

export async function adminBulkAction(ids: number[], action: string, value?: string) {
  await requireAdmin()
  const supabase = createAdminClient()

  if (action === 'publish') {
    const { error } = await supabase.from('pitches')
      .update({ visibility: 'publish' as any, published_at: new Date().toISOString() })
      .in('id', ids)
    if (error) throw new Error(error.message)
  } else if (action === 'draft') {
    const { error } = await supabase.from('pitches')
      .update({ visibility: 'draft' as any })
      .in('id', ids)
    if (error) throw new Error(error.message)
  } else if (action === 'trash') {
    const { error } = await supabase.from('pitches')
      .update({ visibility: 'private' as any })
      .in('id', ids)
    if (error) throw new Error(error.message)
  } else if (action === 'feature') {
    const { error } = await supabase.from('pitches')
      .update({ featured: true })
      .in('id', ids)
    if (error) throw new Error(error.message)
  } else if (action === 'unfeature') {
    const { error } = await supabase.from('pitches')
      .update({ featured: false })
      .in('id', ids)
    if (error) throw new Error(error.message)
  } else if (action === 'delete') {
    // Hard delete — remove attachments from storage first
    for (const id of ids) {
      const { data: attachments } = await supabase
        .from('pitch_attachments')
        .select('id, storage_path')
        .eq('pitch_id', id)
      if (attachments && attachments.length > 0) {
        const paths = attachments.map((a: any) => a.storage_path).filter(Boolean)
        if (paths.length > 0) {
          await supabase.storage.from('media').remove(paths)
        }
      }
    }
    const { error } = await supabase.from('pitches')
      .delete()
      .in('id', ids)
    if (error) throw new Error(error.message)
  }

  revalidatePath('/admin/pitches')
  revalidatePath('/pitches')
}

export async function adminTrashPitch(id: number) {
  await requireAdmin()
  const supabase = createAdminClient()

  const { error } = await supabase.from('pitches')
    .update({ visibility: 'private' as any })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/pitches')
}
