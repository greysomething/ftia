'use client'

import { useState } from 'react'

export default function SendResetButton({ email }: { email: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleClick() {
    setStatus('sending')
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setStatus(res.ok ? 'sent' : 'error')
    } catch {
      setStatus('error')
    }
    // Reset after a few seconds
    setTimeout(() => setStatus('idle'), 4000)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === 'sending'}
      className="text-xs text-primary hover:text-primary-light hover:underline disabled:opacity-50 whitespace-nowrap"
      title={`Send password reset email to ${email}`}
    >
      {status === 'idle' && 'Send Password Reset'}
      {status === 'sending' && 'Sending…'}
      {status === 'sent' && '✓ Reset email sent'}
      {status === 'error' && 'Failed — try again'}
    </button>
  )
}
