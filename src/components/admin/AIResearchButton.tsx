'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface AIResearchButtonProps {
  type: 'company' | 'crew'
  name: string
  /** DB id of the record being enriched. When provided, high-confidence fields auto-save. */
  recordId?: number | null
  existingData?: Record<string, any>
  onResult: (data: any) => void
}

interface ApplyResult {
  applied_count: number
  applied: Record<string, any>
  skipped_existing: string[]
  low_confidence: string[]
  needs_review: Record<string, any>
  last_enriched_at: string
  links_created?: Array<{
    company_id: number
    company_name: string
    crew_id: number
    crew_name: string
    via: string
  }>
}

export function AIResearchButton({ type, name, recordId, existingData, onResult }: AIResearchButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleResearch() {
    if (!name.trim()) {
      setError(`Enter a ${type} name first.`)
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    setApplyResult(null)

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

      // Auto-apply high-confidence fields straight to DB if we have an id.
      if (recordId) {
        setApplying(true)
        try {
          const applyRes = await fetch('/api/admin/ai-research/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, id: recordId, data: data.data }),
          })
          const applyJson = await applyRes.json()
          if (applyRes.ok) {
            setApplyResult(applyJson)
            // If anything was actually written, refresh the route so the
            // server-rendered form re-loads with the new values.
            if (applyJson.applied_count > 0) router.refresh()
          } else {
            setError(`Auto-save failed: ${applyJson.error ?? 'unknown error'}`)
          }
        } catch {
          setError('Auto-save network error.')
        } finally {
          setApplying(false)
        }
      }
    } catch {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }

  const fieldCount = result
    ? Object.entries(result)
        .filter(([k]) => k !== 'field_metadata' && k !== 'searched_but_not_found')
        .filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
        .length
    : 0

  return (
    <div>
      <button
        type="button"
        onClick={handleResearch}
        disabled={loading || applying || !name.trim()}
        className="inline-flex items-center gap-2 text-sm font-medium bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading || applying ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {applying ? `Saving confident fields…` : `Researching ${name}…`}
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
        <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-purple-800">
              AI found {fieldCount} data points for &ldquo;{name}&rdquo;
            </span>
          </div>

          {applyResult && applyResult.applied_count > 0 && (
            <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded p-2">
              <svg className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div className="text-xs text-green-800">
                <strong>{applyResult.applied_count} field{applyResult.applied_count === 1 ? '' : 's'} auto-saved</strong>
                {' '}(high confidence): {Object.keys(applyResult.applied).join(', ')}
              </div>
            </div>
          )}

          {applyResult && applyResult.low_confidence.length > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-2">
              <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="text-xs text-amber-800">
                <strong>{applyResult.low_confidence.length} suggestion{applyResult.low_confidence.length === 1 ? '' : 's'} need review</strong>
                {' '}(filled in form, not yet saved): {applyResult.low_confidence.join(', ')}
              </div>
            </div>
          )}

          {applyResult && applyResult.skipped_existing.length > 0 && (
            <p className="text-xs text-gray-600">
              Skipped {applyResult.skipped_existing.length} field{applyResult.skipped_existing.length === 1 ? '' : 's'} where existing data is already present: {applyResult.skipped_existing.join(', ')}
            </p>
          )}

          {applyResult && applyResult.links_created && applyResult.links_created.length > 0 && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded p-2">
              <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <div className="text-xs text-blue-800">
                <strong>Auto-linked {applyResult.links_created.length} crew↔company relationship{applyResult.links_created.length === 1 ? '' : 's'}</strong>
                <ul className="mt-1 space-y-0.5">
                  {applyResult.links_created.map((l, i) => (
                    <li key={i}>
                      {type === 'crew'
                        ? <>Linked to <strong>{l.company_name}</strong></>
                        : <>Linked crew <strong>{l.crew_name}</strong></>
                      }
                      <span className="text-blue-600"> ({l.via})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {!recordId && (
            <p className="text-xs text-purple-600">
              Fields have been auto-filled above. Review and save.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
