'use client'

import { useState, useCallback } from 'react'

interface ProgressState {
  phase: string
  message?: string
  total?: number
  totalBatches?: number
  batch?: number
  sent?: number
  failed?: number
  processed?: number
  error?: string
  success?: boolean
  dryRun?: boolean
  stats?: Record<string, any>
}

export function SendDigestButton({ currentWeekCount }: { currentWeekCount: number }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info')
  const [showConfirm, setShowConfirm] = useState(false)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [isDryRun, setIsDryRun] = useState(false)

  const canSend = currentWeekCount >= 40

  async function handlePreview() {
    window.open('/api/admin/send-weekly-digest?preview=true', '_blank')
  }

  async function handleSendTest() {
    const email = prompt('Enter email address for test digest:')
    if (!email) return

    setLoading(true)
    setMessage(null)
    setProgress(null)
    setIsDryRun(false)
    try {
      const res = await fetch(`/api/admin/send-weekly-digest?test=${encodeURIComponent(email)}`, {
        method: 'POST',
      })
      const data = await res.json()
      setMessage(data.message || data.error)
      setMessageType(res.ok ? 'success' : 'error')
    } catch {
      setMessage('Network error.')
      setMessageType('error')
    } finally {
      setLoading(false)
    }
  }

  const streamSend = useCallback(async (dryRun: boolean) => {
    setShowConfirm(false)
    setLoading(true)
    setMessage(null)
    setIsDryRun(dryRun)
    setProgress({ phase: 'starting', message: 'Initializing...' })

    const url = `/api/admin/send-weekly-digest?stream=true${dryRun ? '&dry_run=true' : ''}`

    try {
      const res = await fetch(url, { method: 'POST' })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: 'Request failed' }))
        setMessage(data.error || 'Failed to start digest send.')
        setMessageType('error')
        setProgress(null)
        setLoading(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event: ProgressState = JSON.parse(line.slice(6))
            setProgress(event)

            if (event.phase === 'done') {
              setMessage(event.message ?? `Sent ${event.stats?.sent ?? 0} emails.`)
              setMessageType(event.success ? 'success' : 'error')
              setLoading(false)
            } else if (event.phase === 'error') {
              setMessage(event.error ?? 'An error occurred.')
              setMessageType('error')
              setLoading(false)
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch {
      setMessage('Network error — connection lost.')
      setMessageType('error')
      setProgress(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const pct = progress?.total && progress.processed
    ? Math.round((progress.processed / progress.total) * 100)
    : 0

  return (
    <div className="admin-card p-4 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-[#3ea8c8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Weekly Production Digest Email
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {canSend ? (
              <>Current week has <strong className="text-green-600">{currentWeekCount}</strong> productions — ready to send.</>
            ) : (
              <>Current week has <strong className="text-amber-600">{currentWeekCount}</strong> productions — needs 40+ to send.</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePreview}
            disabled={loading}
            className="btn-outline text-sm py-1.5 px-3"
          >
            Preview
          </button>
          <button
            onClick={handleSendTest}
            disabled={loading}
            className="btn-outline text-sm py-1.5 px-3"
          >
            Send Test
          </button>
          <button
            onClick={() => streamSend(true)}
            disabled={loading}
            className="btn-outline text-sm py-1.5 px-3 flex items-center gap-1.5"
            title="Simulate the full send flow without sending any emails"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Dry Run
          </button>
          {showConfirm ? (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <span className="text-sm text-red-700 font-medium">Send to all members?</span>
              <button
                onClick={() => streamSend(false)}
                disabled={loading}
                className="text-sm bg-red-600 text-white px-3 py-1 rounded font-medium hover:bg-red-700"
              >
                Yes, Send
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={loading || !canSend}
              className="btn-primary text-sm py-1.5 px-4 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && !isDryRun ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending…
                </>
              ) : (
                'Send to All Members'
              )}
            </button>
          )}
        </div>
      </div>

      {/* Real-time progress panel */}
      {progress && loading && (
        <div className={`mt-4 border rounded-lg overflow-hidden ${isDryRun ? 'border-amber-200' : 'border-gray-200'}`}>
          {/* Dry run banner */}
          {isDryRun && (
            <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 flex items-center gap-2 text-xs font-medium text-amber-700">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              DRY RUN — No emails will be sent
            </div>
          )}

          {/* Progress bar */}
          <div className="h-2 bg-gray-100">
            <div
              className={`h-full transition-all duration-300 ease-out ${isDryRun ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-[#3ea8c8] to-[#2b7bb9]'}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="p-3 space-y-2">
            {/* Phase status */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <svg className={`w-4 h-4 animate-spin ${isDryRun ? 'text-amber-500' : 'text-[#3ea8c8]'}`} fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {progress.phase === 'audience' && 'Fetching audience contacts...'}
                {progress.phase === 'dedup' && progress.message}
                {progress.phase === 'sending' && progress.message}
                {progress.phase === 'batch' && `Batch ${progress.batch} of ${progress.totalBatches}`}
                {progress.phase === 'starting' && 'Initializing...'}
              </div>

              {progress.total != null && progress.processed != null && (
                <span className="text-xs text-gray-500 font-mono">
                  {progress.processed}/{progress.total} ({pct}%)
                </span>
              )}
            </div>

            {/* Counters */}
            {(progress.sent != null || progress.failed != null) && (
              <div className="flex items-center gap-4 text-xs">
                {progress.sent != null && progress.sent > 0 && (
                  <span className="flex items-center gap-1 text-green-600">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {progress.sent} {isDryRun ? 'would send' : 'sent'}
                  </span>
                )}
                {progress.failed != null && progress.failed > 0 && (
                  <span className="flex items-center gap-1 text-red-500">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {progress.failed} failed
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {message && !loading && (
        <div className={`mt-3 text-sm px-3 py-2 rounded-lg ${
          messageType === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
          messageType === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
          'bg-blue-50 text-blue-700 border border-blue-200'
        }`}>
          {message}
        </div>
      )}
    </div>
  )
}
