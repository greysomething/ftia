'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ChangePasswordForm() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (newPassword.length < 8) {
      setStatus('error')
      setMessage('Password must be at least 8 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setStatus('error')
      setMessage('Passwords do not match.')
      return
    }

    setStatus('loading')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setStatus('error')
      setMessage(error.message)
    } else {
      setStatus('success')
      setMessage('Password updated successfully.')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm text-gray-500 mb-1">New Password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => { setNewPassword(e.target.value); setStatus('idle') }}
          className="form-input w-full max-w-xs"
          placeholder="Min. 8 characters"
          minLength={8}
          required
        />
      </div>
      <div>
        <label className="block text-sm text-gray-500 mb-1">Confirm New Password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); setStatus('idle') }}
          className="form-input w-full max-w-xs"
          placeholder="Re-enter password"
          required
        />
      </div>

      {status === 'error' && (
        <p className="text-sm text-red-600">{message}</p>
      )}
      {status === 'success' && (
        <p className="text-sm text-green-600">{message}</p>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="px-4 py-2 bg-primary text-white text-sm font-medium rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {status === 'loading' ? 'Updating...' : 'Update Password'}
      </button>
    </form>
  )
}
