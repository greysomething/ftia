import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/admin/impersonate
 * Body: { userId: string }
 *
 * Generates a Supabase magic link for the target user and redirects.
 * Stores the admin's user ID in a cookie so we can show an exit banner.
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { userId } = await req.json()
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  // Don't allow impersonating yourself
  if (userId === admin.user.id) {
    return NextResponse.json({ error: 'Cannot impersonate yourself' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Get the target user's email
  const { data: { user: targetUser }, error: userError } = await supabase.auth.admin.getUserById(userId)
  if (userError || !targetUser?.email) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Get admin name for the banner
  const adminName = [admin.profile.first_name, admin.profile.last_name].filter(Boolean).join(' ') || 'Admin'

  // Generate a magic link for the target user
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://productionlist.com'
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: targetUser.email,
    options: {
      redirectTo: `${siteUrl}/auth/callback?next=/membership-account`,
    },
  })

  if (linkError || !linkData?.properties?.action_link) {
    console.error('[impersonate] Failed to generate link:', linkError)
    return NextResponse.json({ error: 'Failed to generate impersonation link' }, { status: 500 })
  }

  // Return the action link — client will redirect to it
  // Set the impersonation cookie so we can show the exit banner
  const response = NextResponse.json({
    actionLink: linkData.properties.action_link,
    targetEmail: targetUser.email,
  })

  response.cookies.set('impersonating_from', JSON.stringify({
    adminId: admin.user.id,
    adminName,
    targetEmail: targetUser.email,
  }), {
    path: '/',
    httpOnly: false, // needs to be readable by client-side banner
    sameSite: 'lax',
    maxAge: 60 * 60 * 4, // 4 hours
  })

  return response
}

/**
 * DELETE /api/admin/impersonate
 * Clears the impersonation cookie and signs out.
 */
export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete('impersonating_from')
  return response
}
