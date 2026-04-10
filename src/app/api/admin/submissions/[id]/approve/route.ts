import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'
import { sendEmail } from '@/lib/send-email'
import { getTemplate } from '@/lib/email-templates'
import { revalidatePath } from 'next/cache'

/**
 * POST /api/admin/submissions/[id]/approve
 * Creates a productions row from the submission, writes link tables,
 * transitions submission to approved, and notifies the submitter.
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

  const supabase = createAdminClient()

  // 1. Fetch the submission
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
      { error: `Cannot approve a ${submission.status} submission.` },
      { status: 400 }
    )
  }
  if (!submission.title) {
    return NextResponse.json({ error: 'Title is required.' }, { status: 400 })
  }

  try {
    // 2. Generate unique slug
    let slug = slugify(submission.title)
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

    // 3. Create the production
    const { data: production, error: prodError } = await supabase
      .from('productions')
      .insert({
        title: submission.title,
        slug,
        content: submission.description || null,
        excerpt: submission.description?.slice(0, 200) || null,
        visibility: 'publish',
        production_date_start: submission.start_date || null,
        production_date_end: submission.end_date || null,
        computed_status: mapStatusName(submission.status_name),
        wp_updated_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (prodError) {
      return NextResponse.json({ error: `Failed to create production: ${prodError.message}` }, { status: 500 })
    }

    const productionId = (production as any).id

    // 4. Create type link
    if (submission.type_name) {
      const typeId = await findOrCreateType(supabase, submission.type_name)
      if (typeId) {
        await supabase.from('production_type_links').insert({
          production_id: productionId,
          type_id: typeId,
          is_primary: true,
        })
      }
    }

    // 5. Create status link
    if (submission.status_name) {
      const statusId = await findOrCreateStatus(supabase, submission.status_name)
      if (statusId) {
        await supabase.from('production_status_links').insert({
          production_id: productionId,
          status_id: statusId,
          is_primary: true,
        })
      }
    }

    // 6. Create locations
    const locations = submission.locations as any[] ?? []
    if (locations.length > 0) {
      await supabase.from('production_locations').insert(
        locations.map((loc: any, i: number) => ({
          production_id: productionId,
          location: '',
          city: loc.city || '',
          stage: loc.stage || '',
          country: loc.country || '',
          sort_order: i,
        }))
      )
    }

    // 7. Create crew roles
    const crewEntries: Array<{ role: string; name: string }> = []
    if (submission.director) crewEntries.push({ role: 'Director', name: submission.director })
    if (submission.producer) crewEntries.push({ role: 'Producer', name: submission.producer })
    if (submission.writer) crewEntries.push({ role: 'Writer', name: submission.writer })
    if (submission.casting_director) crewEntries.push({ role: 'Casting Director', name: submission.casting_director })
    const extraCrew = submission.extra_crew as any[] ?? []
    for (const c of extraCrew) {
      if (c.role && c.name) crewEntries.push({ role: c.role, name: c.name })
    }
    if (crewEntries.length > 0) {
      await supabase.from('production_crew_roles').insert(
        crewEntries.map((c, i) => ({
          production_id: productionId,
          role_name: c.role,
          inline_name: c.name,
          crew_id: null,
          sort_order: i,
        }))
      )
    }

    // 8. Create company link
    if (submission.production_company) {
      await supabase.from('production_company_links').insert({
        production_id: productionId,
        inline_name: submission.production_company,
        company_id: null,
        sort_order: 0,
      })
    }

    // 9. Transition submission to approved
    await supabase
      .from('production_submissions')
      .update({
        status: 'approved',
        published_production_id: productionId,
        reviewed_at: new Date().toISOString(),
        reviewed_by: admin.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId)

    // 10. Send approval email to submitter
    try {
      const { data: submitterProfile } = await supabase
        .from('user_profiles')
        .select('first_name')
        .eq('id', submission.user_id)
        .single()

      const { data: { user: submitterUser } } = await supabase.auth.admin.getUserById(submission.user_id)

      if (submitterUser?.email) {
        const template = getTemplate('production-submission-approved')
        if (template) {
          const productionUrl = `https://productionlist.com/productions/${slug}`
          const { subject, html } = template.render({
            firstName: (submitterProfile as any)?.first_name || '',
            productionTitle: submission.title,
            productionUrl,
          })
          await sendEmail({
            to: submitterUser.email,
            subject,
            html,
            templateSlug: 'production-submission-approved',
          })
        }
      }
    } catch (emailErr) {
      console.error('[approve-submission] Failed to send approval email:', emailErr)
      // Don't fail the approval over an email error
    }

    // 11. Log activity
    try {
      await supabase.from('activity_log').insert({
        email: admin.user.email ?? '',
        event_type: 'submission_approved',
        user_agent: 'Admin',
        metadata: {
          submission_id: submissionId,
          production_id: productionId,
          title: submission.title,
        },
      })
    } catch { /* swallow */ }

    revalidatePath('/admin/submissions')
    revalidatePath('/admin/productions')
    revalidatePath('/productions')

    return NextResponse.json({ ok: true, productionId, slug })
  } catch (err: any) {
    console.error('[approve-submission] Error:', err)
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 })
  }
}

/**
 * Map a free-text status name to a computed_status enum value.
 */
function mapStatusName(name: string | null): string | null {
  if (!name) return null
  const lower = name.toLowerCase()
  if (lower.includes('pre-production') || lower.includes('pre production')) return 'in-pre-production'
  if (lower.includes('post-production') || lower.includes('post production')) return 'in-post-production'
  if (lower.includes('production') || lower.includes('filming') || lower.includes('shooting')) return 'in-production'
  if (lower.includes('completed') || lower.includes('wrapped')) return 'completed'
  return 'in-pre-production' // default
}

/**
 * Find a production_type by name (case-insensitive) or create one.
 */
async function findOrCreateType(supabase: ReturnType<typeof createAdminClient>, name: string): Promise<number | null> {
  // Try exact match first
  const { data: existing } = await supabase
    .from('production_types')
    .select('id')
    .ilike('name', name)
    .limit(1)
    .maybeSingle()

  if (existing) return (existing as any).id

  // Create new
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const { data: created } = await supabase
    .from('production_types')
    .insert({ name, slug })
    .select('id')
    .single()

  return created ? (created as any).id : null
}

/**
 * Find a production_status by name (case-insensitive) or create one.
 */
async function findOrCreateStatus(supabase: ReturnType<typeof createAdminClient>, name: string): Promise<number | null> {
  const { data: existing } = await supabase
    .from('production_statuses')
    .select('id')
    .ilike('name', name)
    .limit(1)
    .maybeSingle()

  if (existing) return (existing as any).id

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const { data: created } = await supabase
    .from('production_statuses')
    .insert({ name, slug })
    .select('id')
    .single()

  return created ? (created as any).id : null
}
