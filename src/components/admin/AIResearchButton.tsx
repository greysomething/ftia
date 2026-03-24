'use client'

import { useState } from 'react'

interface AIResearchButtonProps {
  type: 'company' | 'crew'
  name: string
  existingData?: Record<string, any>
  onResult: (data: any) => void
}

export function AIResearchButton({ type, name, existingData, onResult }: AIResearchButtonProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleResearch() {
    if (!name.trim()) {
      setError(`Enter a ${type} name first.`)
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/admin/ai-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name: name.trim(), existingData }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Research failed.')
        return
      }
      setResult(data.data)
      onResult(data.data)
    } catch {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }

  const fieldCount = result ? Object.values(result).filter(v => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)).length : 0

  return (
    <div>
      <button
        type="button"
        onClick={handleResearch}
        disabled={loading || !name.trim()}
        className="inline-flex items-center gap-2 text-sm font-medium bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Researching {name}…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            AI Research
          </>
        )}
      </button>

      {error && (
        <p className="text-xs text-red-500 mt-2">{error}</p>
      )}

      {result && (
        <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-purple-800">
              AI found {fieldCount} data points for &ldquo;{name}&rdquo;
            </span>
          </div>
          <p className="text-xs text-purple-600">
            Fields have been auto-filled above. Review and save.
          </p>
        </div>
      )}
    </div>
  )
}
