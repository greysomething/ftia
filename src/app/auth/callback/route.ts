import { NextRequest, NextResponse } from 'next/server'
import { createRawClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity-log'

/**
 * GET /auth/callback
 * Handles Supabase auth redirects — password reset, email confirmation, magic links.
 * Exchanges the code for a session, then redirects to the `next` param or /productions.
 *
 * Uses createRawClient() (not createClient) because:
 * 1. Auth callback must use real session cookies (not impersonation-aware client)
 * 2. The admin client (service-role) can't exchange auth codes — it has no session context
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/productions'
  const redirectUrl = new URL(next, req.url)
  const isPasswordReset = next.includes('reset-password')

  if (code) {
    const supabase = await createRawClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Log successful callback (get the user from the new session)
      const { data: { user } } = await supabase.auth.getUser()
      if (user && isPasswordReset) {
        logActivity({
          userId: user.id,
          email: user.email,
          eventType: 'password_reset',
          metadata: { step: 'link_verified', next },
          reqHeaders: req.headers,
        }).catch(() => {})
      }
      return NextResponse.redirect(redirectUrl)
    }
    console.error('[auth/callback] Code exchange failed:', error.message)

    // Log the failure
    logActivity({
      eventType: 'password_reset_failed',
      metadata: { error: error.message, next },
      reqHeaders: req.headers,
    }).catch(() => {})
  }

  // If no code or exchange failed, redirect to login with error
  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('error', 'auth_callback_failed')
  return NextResponse.redirect(loginUrl)
}
