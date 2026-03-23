'use client'

import { useState } from 'react'

export function RemoveFromWeekButton({ entryId, weekMonday }: { entryId: number; weekMonday: string }) {
  const [loading, setLoading] = useState(false)

  async function handleRemove() {
    if (!confirm('Remove this production from the weekly list?')) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/weekly-entry', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId }),
      })
      if (res.ok) {
        window.location.reload()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleRemove}
      disabled={loading}
      className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
    >
      {loading ? 'Removing…' : 'Remove'}
    </button>
  )
}
