import { NextRequest, NextResponse } from 'next/server'
import { createRawClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity-log'

/**
 * GET /auth/callback
 * Handles Supabase auth redirects — password reset, email confirmation, magic links.
 *
 * Supports TWO flows:
 *
 * 1. **PKCE code flow** (legacy / client-initiated):
 *    ?code=XXX&next=/reset-password
 *    Exchanges the code for a session. Requires same browser.
 *
 * 2. **Token hash flow** (server-initiated, cross-browser safe):
 *    ?token_hash=XXX&type=recovery&next=/reset-password
 *    Verifies the OTP token hash directly. Works from ANY browser.
 *
 * Uses createRawClient() (not createClient) because auth callbacks must use
 * the real session cookies, not the impersonation-aware client.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'recovery' | 'signup' | 'email' | null
  const next = searchParams.get('next') ?? '/productions'
  const redirectUrl = new URL(next, req.url)
  const isPasswordReset = next.includes('reset-password')

  const supabase = await createRawClient()

  // ── Flow 1: Token hash (cross-browser safe) ──────────────────────
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    })

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user && isPasswordReset) {
        logActivity({
          userId: user.id,
          email: user.email,
          eventType: 'password_reset',
          metadata: { step: 'link_verified', method: 'token_hash', next },
          reqHeaders: req.headers,
        }).catch(() => {})
      }
      return NextResponse.redirect(redirectUrl)
    }

    console.error('[auth/callback] Token hash verification failed:', error.message)
    logActivity({
      eventType: 'password_reset_failed',
      metadata: { error: error.message, method: 'token_hash', next },
      reqHeaders: req.headers,
    }).catch(() => {})

    // Fall through to error redirect below
  }

  // ── Flow 2: PKCE code exchange (same-browser only) ───────────────
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user && isPasswordReset) {
        logActivity({
          userId: user.id,
          email: user.email,
          eventType: 'password_reset',
          metadata: { step: 'link_verified', method: 'pkce', next },
          reqHeaders: req.headers,
        }).catch(() => {})
      }
      return NextResponse.redirect(redirectUrl)
    }

    console.error('[auth/callback] Code exchange failed:', error.message)
    logActivity({
      eventType: 'password_reset_failed',
      metadata: { error: error.message, method: 'pkce', next },
      reqHeaders: req.headers,
    }).catch(() => {})
  }

  // If no valid auth params or exchange/verification failed → login with error
  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('error', 'auth_callback_failed')
  return NextResponse.redirect(loginUrl)
}
