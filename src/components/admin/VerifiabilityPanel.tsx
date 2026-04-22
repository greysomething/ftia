'use client'

/**
 * Verifiability report panel for the blog edit page. Shows the most recent
 * AI fact-check result with a per-claim breakdown, plus a Re-verify button.
 *
 * Only renders for AI-generated posts. Manual posts don't get a score.
 */

import { useState } from 'react'

interface Claim {
  claim: string
  status: 'verified' | 'unverified' | 'false'
  source?: string | null
  reasoning?: string | null
}

interface Report {
  score: number
  total_claims: number
  verified: number
  unverified: number
  false_count: number
  summary: string
  claims: Claim[]
  ran_at: string
  model: string
}

interface Props {
  postId: number
  aiGenerated: boolean
  score: number | null
  checkedAt: string | null
  report: Report | null
  visibility: string
}

export function VerifiabilityPanel({
  postId, aiGenerated, score, checkedAt, report, visibility,
}: Props) {
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latestReport, setLatestReport] = useState<Report | null>(report)
  const [latestScore, setLatestScore] = useState<number | null>(score)
  const [latestCheckedAt, setLatestCheckedAt] = useState<string | null>(checkedAt)
  const [latestTrashed, setLatestTrashed] = useState<boolean>(false)
  const [expanded, setExpanded] = useState(false)

  if (!aiGenerated) return null

  async function runVerify() {
    if (!confirm('Run the AI fact-checker on this post? It uses web search and takes ~10-20 seconds. If the score comes back below the threshold, this post will be moved to trash.')) return
    setVerifying(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/blog/${postId}/verify`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Verification failed')
      setLatestReport(data.report)
      setLatestScore(data.score)
      setLatestCheckedAt(data.report?.ran_at ?? new Date().toISOString())
      setLatestTrashed(!!data.trashed)
      setExpanded(true)
      // If trashed, refresh page after a moment so the status bar updates
      if (data.trashed) {
        setTimeout(() => window.location.reload(), 2000)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setVerifying(false)
    }
  }

  // Color the score badge
  let badgeCls = 'bg-gray-100 text-gray-600'
  if (latestScore != null) {
    if (latestScore >= 85) badgeCls = 'bg-green-100 text-green-700'
    else if (latestScore >= 60) badgeCls = 'bg-yellow-100 text-yellow-700'
    else badgeCls = 'bg-red-100 text-red-700'
  }

  return (
    <div className="admin-card mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">AI Verifiability Report</h3>
            <p className="text-xs text-gray-500">
              {latestCheckedAt
                ? `Last checked ${new Date(latestCheckedAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} PT`
                : 'AI-generated — has not been fact-checked yet'}
            </p>
          </div>
          {latestScore != null && (
            <span className={`inline-flex items-center px-3 py-1 text-sm font-bold rounded-full ${badgeCls}`}>
              {latestScore}/100
            </span>
          )}
          {latestTrashed && (
            <span className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
              Auto-discarded — moved to trash
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {latestReport && (
            <button type="button" onClick={() => setExpanded(e => !e)}
              className="text-xs text-gray-500 hover:text-gray-700">
              {expanded ? 'Hide details' : 'Show details'}
            </button>
          )}
          <button type="button" onClick={runVerify} disabled={verifying}
            className="btn-outline text-xs disabled:opacity-50">
            {verifying ? (
              <span className="flex items-center gap-1.5">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Verifying…
              </span>
            ) : (latestScore != null ? 'Re-verify' : 'Run verification')}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}

      {latestReport && expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          {/* Stats */}
          <div className="flex items-center gap-4 text-xs">
            <div><span className="text-gray-400">Total claims:</span> <span className="font-semibold text-gray-700">{latestReport.total_claims}</span></div>
            <div><span className="text-green-700 font-semibold">{latestReport.verified}</span> verified</div>
            <div><span className="text-yellow-700 font-semibold">{latestReport.unverified}</span> unverified</div>
            <div><span className="text-red-700 font-semibold">{latestReport.false_count}</span> false</div>
          </div>

          {latestReport.summary && (
            <p className="text-xs text-gray-600 italic bg-gray-50 rounded p-2 border border-gray-100">
              {latestReport.summary}
            </p>
          )}

          {/* Claims list */}
          {latestReport.claims.length > 0 && (
            <div className="space-y-1.5">
              {latestReport.claims.map((c, i) => {
                const tone = c.status === 'verified' ? 'border-green-200 bg-green-50'
                  : c.status === 'false' ? 'border-red-200 bg-red-50'
                  : 'border-yellow-200 bg-yellow-50'
                const dot = c.status === 'verified' ? 'bg-green-500'
                  : c.status === 'false' ? 'bg-red-500'
                  : 'bg-yellow-500'
                return (
                  <div key={i} className={`text-xs border rounded p-2 ${tone}`}>
                    <div className="flex items-start gap-2">
                      <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-gray-800">{c.claim}</div>
                        {c.reasoning && (
                          <div className="text-gray-500 mt-0.5">{c.reasoning}</div>
                        )}
                        {c.source && (
                          <div className="text-gray-400 mt-0.5 truncate">
                            Source: {c.source.startsWith('http')
                              ? <a href={c.source} target="_blank" rel="noopener" className="hover:text-[#3ea8c8] underline">{c.source}</a>
                              : c.source}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-bold uppercase text-gray-500 flex-shrink-0">
                        {c.status === 'false' ? 'FALSE' : c.status}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {!latestReport && !verifying && (
        <p className="mt-2 text-xs text-gray-500">
          Click <span className="font-medium">Run verification</span> to fact-check this article against public sources.
          {visibility === 'trash' && ' (Currently in trash — re-verifying will rescore but not auto-restore.)'}
        </p>
      )}
    </div>
  )
}
