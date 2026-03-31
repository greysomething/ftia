import { NextRequest, NextResponse } from 'next/server'
import { createRawClient, createAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/admin/impersonate
 * Body: { userId: string }
 *
 * Cookie-based impersonation: the admin stays logged in as themselves,
 * but a cookie tells auth functions to return the target user's data.
 */
export async function POST(req: NextRequest) {
  // Verify the real caller is an admin — use raw client to get the real session
  const supabase = await createRawClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()
  const { data: adminProfile } = await adminClient
    .from('user_profiles')
    .select('id, role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (adminProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { userId } = await req.json()
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  if (userId === user.id) {
    return NextResponse.json({ error: 'Cannot impersonate yourself' }, { status: 400 })
  }

  // Verify the target user exists
  const { data: { user: targetUser }, error: userError } = await adminClient.auth.admin.getUserById(userId)
  if (userError || !targetUser?.email) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Get target user's profile for display name
  const { data: targetProfile } = await adminClient
    .from('user_profiles')
    .select('first_name, last_name, display_name')
    .eq('id', userId)
    .single()

  const targetName = targetProfile?.display_name
    || [targetProfile?.first_name, targetProfile?.last_name].filter(Boolean).join(' ')
    || targetUser.email

  const adminName = [adminProfile.first_name, adminProfile.last_name].filter(Boolean).join(' ') || 'Admin'

  // Redirect to /productions if user has an active membership, otherwise /membership-account
  let redirectTo = '/membership-account'
  const { data: membership } = await adminClient
    .from('user_memberships')
    .select('status')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'past_due'])
    .limit(1)
    .single()
  if (membership) redirectTo = '/productions'

  const response = NextResponse.json({ success: true, redirectTo })

  // Set impersonation cookie — readable by both server and client
  response.cookies.set('impersonate_uid', JSON.stringify({
    targetId: userId,
    targetEmail: targetUser.email,
    targetName,
    adminId: user.id,
    adminName,
  }), {
    path: '/',
    httpOnly: false, // must be readable by client-side banner
    sameSite: 'lax',
    maxAge: 60 * 60 * 4, // 4 hours
  })

  return response
}

/**
 * DELETE /api/admin/impersonate
 * Clears the impersonation cookie and returns the admin user ID
 * so the client can redirect back to the admin user page.
 */
export async function DELETE(req: NextRequest) {
  // Read the cookie to get the admin's user detail page URL
  const cookieValue = req.cookies.get('impersonate_uid')?.value
  let targetId: string | null = null
  try {
    if (cookieValue) {
      const parsed = JSON.parse(cookieValue)
      targetId = parsed.targetId
    }
  } catch { /* ignore */ }

  const response = NextResponse.json({
    success: true,
    redirectTo: targetId ? `/admin/users/${targetId}` : '/admin',
  })

  response.cookies.set('impersonate_uid', '', {
    path: '/',
    maxAge: 0,
  })

  return response
}
