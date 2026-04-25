'use server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function savePitch(prevState: any, formData: FormData) {
  const user = await requireAuth()
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
  const visibility = String(formData.get('visibility') ?? 'draft') as 'draft' | 'publish'

  // Parse genre IDs
  let genreIds: number[] = []
  try { genreIds = JSON.parse(formData.get('genre_ids') as string ?? '[]') } catch {}

  // Validation
  if (!title) return { error: 'Title is required.' }
  if (!logline) return { error: 'Logline is required.' }
  if (logline.length > 300) return { error: 'Logline must be 300 characters or less.' }

  // Generate slug
  let slug = String(formData.get('slug') ?? '').trim() || slugify(title)

  // Verify ownership for updates
  if (id) {
    const { data: existing } = await supabase
      .from('pitches')
      .select('user_id')
      .eq('id', id)
      .single()
    if (!existing || existing.user_id !== user.id) {
      return { error: 'You do not have permission to edit this pitch.' }
    }
  }

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
  }

  // Set published_at when publishing for the first time
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
    row.user_id = user.id
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

  revalidatePath('/membership-account/my-pitches')
  revalidatePath('/pitches')
  redirect(`/membership-account/my-pitches/${pitchId}/edit`)
}

export async function deletePitch(id: number) {
  const user = await requireAuth()
  const supabase = createAdminClient()

  // Verify ownership
  const { data: pitch } = await supabase
    .from('pitches')
    .select('user_id')
    .eq('id', id)
    .single()
  if (!pitch || pitch.user_id !== user.id) {
    throw new Error('You do not have permission to delete this pitch.')
  }

  // Soft delete — set visibility to private
  await supabase.from('pitches').update({ visibility: 'private' }).eq('id', id)

  revalidatePath('/membership-account/my-pitches')
  revalidatePath('/pitches')
}

export async function deletePitchAttachment(attachmentId: number) {
  const user = await requireAuth()
  const supabase = createAdminClient()

  // Verify ownership
  const { data: attachment } = await supabase
    .from('pitch_attachments')
    .select('id, user_id, storage_path, pitch_id')
    .eq('id', attachmentId)
    .single()
  if (!attachment || attachment.user_id !== user.id) {
    throw new Error('You do not have permission to delete this attachment.')
  }

  // Delete from storage
  if (attachment.storage_path) {
    await supabase.storage.from('media').remove([attachment.storage_path])
  }

  // Delete DB record
  await supabase.from('pitch_attachments').delete().eq('id', attachmentId)

  revalidatePath(`/membership-account/my-pitches/${attachment.pitch_id}/edit`)
}
