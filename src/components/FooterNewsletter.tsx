'use client'

import { useState } from 'react'

export default function FooterNewsletter() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return

    setStatus('loading')
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setStatus('success')
      setMessage(data.alreadySubscribed ? 'You\'re already subscribed!' : 'You\'re subscribed! Check your inbox.')
      setEmail('')
    } catch (err: any) {
      setStatus('error')
      setMessage(err.message || 'Something went wrong.')
    }
  }

  if (status === 'success') {
    return (
      <p className="text-sm text-green-400">{message}</p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setStatus('idle') }}
        placeholder="Enter your email"
        required
        className="px-3 py-1.5 bg-white/10 border border-white/20 rounded text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-accent w-56"
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="px-4 py-1.5 bg-accent text-charcoal text-sm font-semibold rounded hover:bg-accent/90 transition-colors disabled:opacity-50 flex-shrink-0"
      >
        {status === 'loading' ? 'Subscribing...' : 'Subscribe'}
      </button>
      {status === 'error' && (
        <span className="text-xs text-red-400 self-center">{message}</span>
      )}
    </form>
  )
}
