import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * PATCH /api/admin/submissions/[id]
 * Admin saves edits to a pending submission.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const submissionId = Number(id)
  if (!submissionId) {
    return NextResponse.json({ error: 'Invalid submission ID' }, { status: 400 })
  }

  const body = await req.json()
  const supabase = createAdminClient()

  // Verify submission exists and is pending
  const { data: existing } = await supabase
    .from('production_submissions')
    .select('status')
    .eq('id', submissionId)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  if (existing.status !== 'pending') {
    return NextResponse.json(
      { error: `Cannot edit a ${existing.status} submission.` },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('production_submissions')
    .update({
      title: body.title ?? null,
      description: body.description ?? null,
      start_date: body.start_date ?? null,
      end_date: body.end_date ?? null,
      production_company: body.production_company ?? null,
      director: body.director ?? null,
      producer: body.producer ?? null,
      writer: body.writer ?? null,
      casting_director: body.casting_director ?? null,
      type_name: body.type_name ?? null,
      status_name: body.status_name ?? null,
      extra_crew: body.extra_crew ?? [],
      locations: body.locations ?? [],
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
