import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendTemplateEmail } from '@/lib/send-email'
import { logActivity } from '@/lib/activity-log'

/**
 * POST /api/auth/forgot-password
 * Body: { email: string }
 *
 * Server-side password reset that bypasses PKCE entirely.
 *
 * Instead of using the client-side resetPasswordForEmail() (which stores
 * a PKCE code_verifier in browser cookies, requiring the reset link to be
 * opened in the same browser), we:
 *
 * 1. Use Supabase Admin API to generate a recovery link (includes token_hash)
 * 2. Extract the token_hash from the generated link
 * 3. Build our own reset URL pointing to /reset-password?token_hash=X&type=recovery
 * 4. Send a branded email with our own template via Resend
 *
 * The reset-password page collects the new password, then POSTs to
 * /api/auth/verify-and-reset which verifies the token and sets the password.
 * This is scanner-proof: email security bots follow GET links but never
 * submit forms, so the token survives until the real user acts.
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const supabase = createAdminClient()

    // Generate a recovery link via Supabase Admin API
    // This creates a secure token without PKCE
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: normalizedEmail,
    })

    if (linkError) {
      // Don't reveal whether the email exists or not
      console.error('[forgot-password] generateLink error:', linkError.message)

      // Still log the attempt
      logActivity({
        email: normalizedEmail,
        eventType: 'password_reset',
        metadata: { step: 'reset_requested', method: 'server' },
        reqHeaders: req.headers,
      }).catch(() => {})

      // Return success even on error (don't leak info about valid emails)
      return NextResponse.json({ success: true })
    }

    // Extract token_hash from the generated link properties
    const tokenHash = linkData?.properties?.hashed_token
    if (!tokenHash) {
      console.error('[forgot-password] No hashed_token in generateLink response')
      return NextResponse.json({ success: true })
    }

    // Build the reset URL that points to our auth callback
    const origin = req.headers.get('origin')
      ?? process.env.NEXT_PUBLIC_SITE_URL
      ?? 'https://productionlist.com'

    // Send user directly to the reset-password page (NOT /auth/callback).
    // This prevents email security scanners from consuming the token —
    // scanners follow GET links but never submit forms. The token is only
    // verified when the user submits their new password.
    const resetUrl = `${origin}/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`

    // Look up the user's first name for a personalized email
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('first_name')
      .eq('email', normalizedEmail)
      .single()

    // Send branded email via our template system
    const emailResult = await sendTemplateEmail({
      to: normalizedEmail,
      templateSlug: 'password-reset',
      vars: {
        firstName: profile?.first_name ?? '',
        resetLink: resetUrl,
      },
    })

    if (!emailResult.success) {
      console.error('[forgot-password] Email send failed:', emailResult.error)
    }

    // Log the reset request
    logActivity({
      email: normalizedEmail,
      eventType: 'password_reset',
      metadata: { step: 'reset_requested', method: 'server' },
      reqHeaders: req.headers,
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[forgot-password] Unexpected error:', err)
    return NextResponse.json({ success: true }) // Don't leak errors
  }
}
