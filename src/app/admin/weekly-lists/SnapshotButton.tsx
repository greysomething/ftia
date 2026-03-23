'use client'

import { useState } from 'react'

export function SnapshotButton() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSnapshot() {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/weekly-snapshot', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setMessage(data.message ?? `Added ${data.count} productions.`)
        // Refresh the page to show updated counts
        window.location.reload()
      } else {
        setMessage(data.error ?? 'Snapshot failed.')
      }
    } catch {
      setMessage('Network error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className="text-sm text-green-600">{message}</span>
      )}
      <button
        onClick={handleSnapshot}
        disabled={loading}
        className="btn-primary flex items-center gap-2"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Snapshotting…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Snapshot This Week
          </>
        )}
      </button>
    </div>
  )
}
