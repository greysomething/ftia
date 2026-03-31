import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity-log'

/**
 * POST /api/auth/verify-and-reset
 * Body: { token_hash: string, type: string, password: string }
 *
 * Verifies the password reset token and sets the new password in one step.
 * This avoids the /auth/callback GET route which gets consumed by email
 * security scanners (AWS, Microsoft, etc.) before the user clicks.
 *
 * Flow:
 * 1. Verify the token_hash via admin-level OTP verification
 * 2. Extract the user from the verified token
 * 3. Update the password via admin API
 */
export async function POST(req: NextRequest) {
  try {
    const { token_hash, type, password } = await req.json()

    if (!token_hash || !type || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Verify the token using the admin client
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    })

    if (verifyError) {
      logActivity({
        eventType: 'password_reset_failed',
        metadata: { error: verifyError.message, method: 'verify_and_reset' },
        reqHeaders: req.headers,
      }).catch(() => {})

      return NextResponse.json(
        { error: 'This password reset link has expired or was already used. Please request a new one.' },
        { status: 400 }
      )
    }

    const user = verifyData?.user
    if (!user) {
      return NextResponse.json({ error: 'Unable to verify user' }, { status: 400 })
    }

    // Update password via admin API (no session needed)
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password,
    })

    if (updateError) {
      logActivity({
        userId: user.id,
        email: user.email,
        eventType: 'password_reset_failed',
        metadata: { error: updateError.message, step: 'password_update_failed' },
        reqHeaders: req.headers,
      }).catch(() => {})

      return NextResponse.json({ error: 'Failed to update password. Please try again.' }, { status: 500 })
    }

    // Log success
    logActivity({
      userId: user.id,
      email: user.email,
      eventType: 'password_reset',
      metadata: { step: 'password_changed', method: 'verify_and_reset' },
      reqHeaders: req.headers,
    }).catch(() => {})

    return NextResponse.json({ success: true, email: user.email })
  } catch (err: any) {
    console.error('[verify-and-reset] Unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
