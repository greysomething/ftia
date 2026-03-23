'use client'

import { useState } from 'react'

export function SupplementButton({ weekMonday, currentCount }: { weekMonday: string; currentCount: number }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ message: string; added: number } | null>(null)

  async function handleSupplement() {
    // Randomize target between 40-50 each time
    const target = 40 + Math.floor(Math.random() * 11)
    const needed = Math.max(0, target - currentCount)

    if (currentCount >= 40) {
      setResult({ message: `List already has ${currentCount} productions (meets 40+ minimum).`, added: 0 })
      return
    }

    if (!confirm(`Add up to ${needed} supplemental productions to reach ${target}?\n\nThis will find published productions from older weekly lists whose filming dates are still 30+ days in the future.`)) {
      return
    }

    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/weekly-supplements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekMonday, targetCount: target }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ message: data.message, added: data.added ?? 0 })
        if (data.added > 0) {
          setTimeout(() => window.location.reload(), 1200)
        }
      } else {
        setResult({ message: data.error ?? 'Failed.', added: 0 })
      }
    } catch {
      setResult({ message: 'Network error.', added: 0 })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className={`text-xs ${result.added > 0 ? 'text-green-600' : 'text-gray-500'}`}>
          {result.message}
        </span>
      )}
      <button
        onClick={handleSupplement}
        disabled={loading}
        className="btn-outline flex items-center gap-2 text-amber-700 border-amber-300 hover:bg-amber-50 whitespace-nowrap"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Finding…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Fill Supplements
          </>
        )}
      </button>
    </div>
  )
}
