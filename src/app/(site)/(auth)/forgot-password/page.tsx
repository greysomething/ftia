'use client'

// PASSWORD RESET: Currently uses Supabase's built-in resetPasswordForEmail()
// which sends Supabase's default email template. This is intentional because
// Supabase handles secure token generation and the magic-link flow.
//
// To customize the password reset email appearance:
// 1. Go to Supabase Dashboard > Authentication > Email Templates
// 2. Edit the "Reset Password" template with branded HTML
// 3. The 'password-reset' template in src/lib/email-templates.ts is ready
//    to use if we switch to a fully custom flow in the future.

import type { Metadata } from 'next'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })

    // Log password reset request (fire-and-forget)
    fetch('/api/log-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType: 'password_reset', metadata: { email } }),
    }).catch(() => {})

    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        <div className="white-bg p-8">
          <h1 className="text-2xl font-bold text-primary text-center mb-6">Reset Password</h1>

          {sent ? (
            <div className="text-center">
              <p className="text-green-700 bg-green-50 border border-green-200 rounded p-4 text-sm">
                If an account with that email exists, we&apos;ve sent a password reset link.
                Check your inbox.
              </p>
              <a href="/login" className="btn-primary mt-6 inline-flex">Back to Login</a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="form-label">Email Address</label>
                <input
                  type="email" required className="form-input"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
