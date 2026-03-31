'use client'

import { useState } from 'react'

export default function ViewAsButton({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false)

  async function handleViewAs() {
    if (!confirm('This will let you browse the site as this user. Your admin session stays active — click "Exit to Admin" in the banner to return.')) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (data.success) {
        // Full page navigation to pick up the new cookie server-side
        window.location.href = data.redirectTo || '/membership-account'
      } else {
        alert(data.error || 'Failed to start impersonation')
        setLoading(false)
      }
    } catch {
      alert('Failed to start impersonation')
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleViewAs}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 hover:text-gray-800 transition-colors disabled:opacity-50 ml-auto"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
      {loading ? 'Loading...' : 'View As User'}
    </button>
  )
}
