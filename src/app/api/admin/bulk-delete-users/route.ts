import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { userIds } = await req.json() as { userIds: string[] }

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: 'No user IDs provided' }, { status: 400 })
  }

  if (userIds.length > 100) {
    return NextResponse.json({ error: 'Maximum 100 users at a time' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Get the current admin's ID to prevent self-deletion
  const { data: { user: currentUser } } = await supabase.auth.getUser()

  // Check none of the selected users are admins (safety check)
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, role, email:display_name')
    .in('id', userIds)

  const adminIds = (profiles ?? []).filter((p: any) => p.role === 'admin').map((p: any) => p.id)
  if (adminIds.length > 0) {
    return NextResponse.json({
      error: `Cannot delete admin accounts. ${adminIds.length} admin(s) in selection.`,
    }, { status: 400 })
  }

  if (currentUser && userIds.includes(currentUser.id)) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  let deleted = 0
  const errors: string[] = []

  for (const userId of userIds) {
    try {
      // Delete memberships first (FK constraint)
      await supabase.from('user_memberships').delete().eq('user_id', userId)

      // Delete profile
      await supabase.from('user_profiles').delete().eq('id', userId)

      // Delete auth user
      const { error: authErr } = await supabase.auth.admin.deleteUser(userId)
      if (authErr) {
        errors.push(`Auth delete failed for ${userId}: ${authErr.message}`)
      } else {
        deleted++
      }
    } catch (err: any) {
      errors.push(`${userId}: ${err.message}`)
    }
  }

  return NextResponse.json({
    ok: true,
    deleted,
    errors,
    message: `Deleted ${deleted} of ${userIds.length} users${errors.length > 0 ? ` (${errors.length} errors)` : ''}`,
  })
}
