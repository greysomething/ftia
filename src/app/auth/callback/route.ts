import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /auth/callback
 * Handles Supabase auth redirects — password reset, email confirmation, magic links.
 * Exchanges the code for a session, then redirects to the `next` param or /my-account.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/my-account'
  const redirectUrl = new URL(next, req.url)

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(redirectUrl)
    }
  }

  // If no code or exchange failed, redirect to login with error
  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('error', 'auth_callback_failed')
  return NextResponse.redirect(loginUrl)
}
