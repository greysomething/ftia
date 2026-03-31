'use client'

import { useState } from 'react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    // Use our server-side API which generates a token_hash link
    // instead of client-side resetPasswordForEmail() which uses PKCE
    // (PKCE fails when user opens the link in a different browser/email app)
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
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
              <p className="text-xs text-gray-500 mt-3">
                Tip: The link works from any browser or device.
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
