'use server'

import { requireAuth } from '@/lib/auth'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkSubmissionRateLimit } from '@/lib/submission-queries'
import { revalidatePath } from 'next/cache'

interface SaveResult {
  error?: string
  success?: boolean
  submissionId?: number
  redirectTo?: string
}

/**
 * Save a submission draft (auto-save or manual save).
 * Creates a new draft if no id, updates existing draft if id provided.
 * Only the owner of a draft can update it, enforced via RLS.
 */
export async function saveSubmissionDraft(prevState: any, formData: FormData): Promise<SaveResult> {
  const user = await requireAuth()
  const supabase = await createClient()

  const id = formData.get('id') ? Number(formData.get('id')) : null
  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const startDate = String(formData.get('start_date') ?? '').trim() || null
  const endDate = String(formData.get('end_date') ?? '').trim() || null
  const productionCompany = String(formData.get('production_company') ?? '').trim()
  const director = String(formData.get('director') ?? '').trim()
  const producer = String(formData.get('producer') ?? '').trim()
  const writer = String(formData.get('writer') ?? '').trim()
  const castingDirector = String(formData.get('casting_director') ?? '').trim()
  const typeName = String(formData.get('type_name') ?? '').trim()
  const statusName = String(formData.get('status_name') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()

  // Parse JSON arrays
  let extraCrew: { role: string; name: string }[] = []
  try {
    const raw = formData.get('extra_crew')
    if (raw) extraCrew = JSON.parse(String(raw))
  } catch { /* ignore */ }

  let locations: { city: string; stage?: string; country: string }[] = []
  try {
    const raw = formData.get('locations')
    if (raw) locations = JSON.parse(String(raw))
  } catch { /* ignore */ }

  const row: Record<string, any> = {
    title: title || null,
    description: description || null,
    start_date: startDate,
    end_date: endDate,
    production_company: productionCompany || null,
    director: director || null,
    producer: producer || null,
    writer: writer || null,
    casting_director: castingDirector || null,
    type_name: typeName || null,
    status_name: statusName || null,
    notes: notes || null,
    extra_crew: extraCrew,
    locations,
    updated_at: new Date().toISOString(),
  }

  if (id) {
    // Update existing draft — RLS ensures only owner of draft can update
    const { error } = await supabase
      .from('production_submissions')
      .update(row)
      .eq('id', id)

    if (error) return { error: error.message }
    return { success: true, submissionId: id }
  } else {
    // Create new draft
    row.user_id = user.id
    row.status = 'draft'

    const { data, error } = await supabase
      .from('production_submissions')
      .insert(row)
      .select('id')
      .single()

    if (error) return { error: error.message }
    return { success: true, submissionId: (data as any).id }
  }
}

/**
 * Submit a draft for review (draft -> pending).
 * Validates required fields and rate limit before transitioning.
 */
export async function submitForReview(prevState: any, formData: FormData): Promise<SaveResult> {
  const user = await requireAuth()
  const supabase = await createClient()

  // First save the latest form data
  const saveResult = await saveSubmissionDraft(null, formData)
  if (saveResult.error) return saveResult

  const submissionId = saveResult.submissionId || Number(formData.get('id'))
  if (!submissionId) return { error: 'No submission to submit.' }

  // Validate required fields
  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const productionCompany = String(formData.get('production_company') ?? '').trim()
  const director = String(formData.get('director') ?? '').trim()
  const producer = String(formData.get('producer') ?? '').trim()

  let locations: { city: string; country: string }[] = []
  try {
    const raw = formData.get('locations')
    if (raw) locations = JSON.parse(String(raw))
  } catch { /* ignore */ }

  if (!title) return { error: 'Title is required.' }
  if (!description) return { error: 'Description is required.' }
  if (!productionCompany) return { error: 'Production company is required.' }
  if (!director && !producer) return { error: 'At least one key crew member (director or producer) is required.' }
  if (locations.length === 0) return { error: 'At least one location is required.' }

  const hasValidLocation = locations.some(l => l.city && l.country)
  if (!hasValidLocation) return { error: 'At least one location must have a city and country.' }

  // Check rate limit
  const rateLimit = await checkSubmissionRateLimit(user.id)
  if (!rateLimit.allowed) {
    return {
      error: `You've reached your daily submission limit (${rateLimit.cap}/day). Try again in ${rateLimit.resetInHours} hour${rateLimit.resetInHours === 1 ? '' : 's'}.`
    }
  }

  // Transition to pending — use admin client for the status transition
  // since RLS only allows updating drafts, and we're changing status to pending
  const adminSupabase = createAdminClient()
  const { error: updateError } = await adminSupabase
    .from('production_submissions')
    .update({
      status: 'pending',
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .eq('user_id', user.id) // security: verify ownership

  if (updateError) return { error: updateError.message }

  // Send confirmation email
  try {
    const { getTemplate } = await import('@/lib/email-templates')
    const { sendEmail } = await import('@/lib/send-email')

    const template = getTemplate('production-submission-received')
    if (template && user.email) {
      // Fetch user's first name
      const { data: profile } = await adminSupabase
        .from('user_profiles')
        .select('first_name')
        .eq('id', user.id)
        .single()

      const { subject, html } = template.render({
        firstName: (profile as any)?.first_name || '',
        productionTitle: title,
      })

      await sendEmail({
        to: user.email,
        subject,
        html,
        templateSlug: 'production-submission-received',
      })
    }
  } catch (emailErr) {
    console.error('[submit-production] Failed to send confirmation email:', emailErr)
    // Don't fail the submission over an email error
  }

  revalidatePath('/membership-account/my-submissions')
  return {
    success: true,
    submissionId,
    redirectTo: '/membership-account/my-submissions?submitted=1',
  }
}
