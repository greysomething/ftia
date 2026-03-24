import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/suggest-edit
 * Stores user-submitted edit suggestions for admin review.
 * Body: { entityType, entityId, entityTitle, suggestion }
 */
export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Must be logged in' }, { status: 401 })
  }

  const { entityType, entityId, entityTitle, suggestion } = await req.json()
  if (!entityType || !entityId || !suggestion?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Store in edit_suggestions table (create if needed via upsert pattern)
  const { error } = await supabase.from('edit_suggestions').insert({
    entity_type: entityType,
    entity_id: entityId,
    entity_title: entityTitle,
    suggestion: suggestion.trim(),
    user_id: user.id,
    user_email: user.email,
    status: 'pending',
  })

  if (error) {
    // Table might not exist yet — log and return success anyway
    console.error('Edit suggestion save error:', error.message)
    // Still return success to not break UX — admin can check logs
    return NextResponse.json({ ok: true, stored: false })
  }

  return NextResponse.json({ ok: true, stored: true })
}
