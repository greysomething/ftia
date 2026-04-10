import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/send-email'
import { getTemplate } from '@/lib/email-templates'
import { revalidatePath } from 'next/cache'

/**
 * POST /api/admin/submissions/[id]/reject
 * Rejects a pending submission with an optional reason.
 * Notifies the submitter by email.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let admin
  try {
    admin = await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const submissionId = Number(id)
  if (!submissionId) {
    return NextResponse.json({ error: 'Invalid submission ID' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const reason = String(body.reason ?? '').trim() || null

  const supabase = createAdminClient()

  // Fetch submission
  const { data: submission } = await supabase
    .from('production_submissions')
    .select('*')
    .eq('id', submissionId)
    .single()

  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }
  if (submission.status !== 'pending') {
    return NextResponse.json(
      { error: `Cannot reject a ${submission.status} submission.` },
      { status: 400 }
    )
  }

  // Transition to rejected
  const { error } = await supabase
    .from('production_submissions')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: admin.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Send rejection email
  try {
    const { data: submitterProfile } = await supabase
      .from('user_profiles')
      .select('first_name')
      .eq('id', submission.user_id)
      .single()

    const { data: { user: submitterUser } } = await supabase.auth.admin.getUserById(submission.user_id)

    if (submitterUser?.email) {
      const template = getTemplate('production-submission-rejected')
      if (template) {
        const { subject, html } = template.render({
          firstName: (submitterProfile as any)?.first_name || '',
          productionTitle: submission.title || 'Untitled',
          rejectionReason: reason || 'No specific reason provided.',
        })
        await sendEmail({
          to: submitterUser.email,
          subject,
          html,
          templateSlug: 'production-submission-rejected',
        })
      }
    }
  } catch (emailErr) {
    console.error('[reject-submission] Failed to send rejection email:', emailErr)
  }

  // Log activity
  try {
    await supabase.from('activity_log').insert({
      email: admin.user.email ?? '',
      event_type: 'submission_rejected',
      user_agent: 'Admin',
      metadata: {
        submission_id: submissionId,
        title: submission.title,
        reason,
      },
    })
  } catch { /* swallow */ }

  revalidatePath('/admin/submissions')

  return NextResponse.json({ ok: true })
}
