'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    // If we have a token_hash, use the server-side verify-and-reset flow
    // (scanner-proof: token is only consumed on form submit, not on page load)
    if (tokenHash && type) {
      try {
        const res = await fetch('/api/auth/verify-and-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token_hash: tokenHash, type, password }),
        })
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Failed to reset password.')
          setLoading(false)
          return
        }

        setSuccess(true)
        setLoading(false)
        setTimeout(() => router.push('/login'), 2000)
      } catch {
        setError('Something went wrong. Please try again.')
        setLoading(false)
      }
      return
    }

    // Fallback: session-based flow (for users who arrived via /auth/callback)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      fetch('/api/log-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: 'password_reset', metadata: { step: 'change_failed', error: updateError.message } }),
      }).catch(() => {})
      return
    }

    fetch('/api/log-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType: 'password_reset', metadata: { step: 'password_changed' } }),
    }).catch(() => {})

    setSuccess(true)
    setLoading(false)
    setTimeout(() => router.push('/productions'), 2000)
  }

  return (
    <div className="white-bg p-8">
      <h1 className="text-2xl font-bold text-primary text-center mb-6">Set New Password</h1>

      {success ? (
        <div className="text-center">
          <p className="text-green-700 bg-green-50 border border-green-200 rounded p-4 text-sm">
            Your password has been updated successfully. Redirecting to login...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-red-600 bg-red-50 border border-red-200 rounded p-3 text-sm">
              {error}
            </p>
          )}

          <div>
            <label className="form-label">New Password</label>
            <input
              type="password"
              required
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              minLength={8}
            />
          </div>

          <div>
            <label className="form-label">Confirm Password</label>
            <input
              type="password"
              required
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              minLength={8}
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      )}
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        <Suspense fallback={
          <div className="white-bg p-8 text-center text-gray-500">Loading...</div>
        }>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
