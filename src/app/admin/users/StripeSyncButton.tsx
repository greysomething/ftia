'use client'

import { useState, useEffect, useRef } from 'react'

interface SyncProgress {
  phase: string
  detail?: string
  current?: number
  total?: number
  percent?: number
  elapsed?: number
}

const PHASE_LABELS: Record<string, string> = {
  init: 'Initializing...',
  loading_users: 'Loading existing users...',
  loading_profiles: 'Loading user profiles...',
  fetching_subscriptions: 'Fetching subscriptions from Stripe...',
  processing_subscriptions: 'Processing subscriptions...',
  backfilling_orders: 'Backfilling payment history...',
  backfilling_customers: 'Updating Stripe customer names...',
  syncing_audiences: 'Syncing email audiences...',
  done: 'Sync complete!',
  error: 'Sync failed',
}

const PHASE_ORDER = [
  'init',
  'loading_users',
  'loading_profiles',
  'fetching_subscriptions',
  'processing_subscriptions',
  'backfilling_orders',
  'backfilling_customers',
  'syncing_audiences',
  'done',
]

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${rem}s`
}

function estimateRemaining(progress: SyncProgress): string | null {
  if (!progress.elapsed || !progress.current || !progress.total || progress.current === 0) return null
  const rate = progress.elapsed / progress.current
  const remaining = rate * (progress.total - progress.current)
  return `~${formatTime(remaining)} remaining`
}

export function StripeSyncButton() {
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [result, setResult] = useState<any>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Block navigation while syncing
  useEffect(() => {
    if (!syncing) return

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = 'Stripe sync is in progress. Leaving may cause incomplete data. Are you sure?'
      return e.returnValue
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [syncing])

  // Intercept link clicks while syncing
  useEffect(() => {
    if (!syncing) return

    function handleClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest('a')
      if (target && target.href && !target.href.includes('#')) {
        e.preventDefault()
        e.stopPropagation()
        alert('Please wait for the Stripe sync to complete before navigating away.')
      }
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [syncing])

  async function handleSync() {
    if (!confirm(
      'Sync all memberships from Stripe?\n\n' +
      'This will:\n' +
      '• Fetch all subscriptions from Stripe\n' +
      '• Create/update membership records\n' +
      '• Backfill payment history\n\n' +
      'This typically takes 5-15 minutes. A progress overlay will appear — please do not navigate away.'
    )) return

    setSyncing(true)
    setResult(null)
    setProgress({ phase: 'init', detail: 'Starting sync...' })

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const res = await fetch('/api/admin/sync-stripe-subscriptions', {
        method: 'POST',
        signal: abort.signal,
      })

      // Check if response is streamed (SSE) or plain JSON
      const contentType = res.headers.get('content-type') ?? ''

      if (contentType.includes('text/event-stream')) {
        // Stream progress events
        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let finalResult: any = null

        while (reader) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.phase === 'done' || data.phase === 'error') {
                  finalResult = data
                } else {
                  setProgress(data)
                }
              } catch { /* skip malformed lines */ }
            }
          }
        }

        if (finalResult) {
          setResult(finalResult)
          setProgress({ phase: 'done' })
        }
      } else {
        // Fallback: plain JSON response (no streaming)
        const data = await res.json()
        setResult(data)
        setProgress({ phase: data.ok ? 'done' : 'error' })
      }

      setTimeout(() => window.location.reload(), 3000)
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setResult({ error: 'Sync was cancelled.' })
      } else {
        setResult({ error: `Network error: ${err.message}` })
      }
      setProgress({ phase: 'error' })
    } finally {
      setSyncing(false)
      abortRef.current = null
    }
  }

  const phaseIndex = progress ? PHASE_ORDER.indexOf(progress.phase) : -1
  const overallPercent = progress?.phase === 'done'
    ? 100
    : progress?.percent != null
      ? Math.max(5, (phaseIndex / PHASE_ORDER.length) * 100 * 0.3 + progress.percent * 0.7)
      : Math.max(5, (phaseIndex / PHASE_ORDER.length) * 100)

  return (
    <>
      <button onClick={handleSync} disabled={syncing}
        className="btn-outline flex items-center gap-2 text-sm">
        {syncing ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Syncing…
          </>
        ) : (
          <>
            <svg className="w-4 h-4 text-[#635BFF]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.18l-.897 5.555C5.014 22.77 7.718 24 11.51 24c2.624 0 4.862-.649 6.334-1.838 1.588-1.28 2.397-3.178 2.397-5.637 0-4.145-2.543-5.827-6.266-7.376z"/>
            </svg>
            Sync Memberships from Stripe
          </>
        )}
      </button>

      {/* Full-page sync overlay */}
      {syncing && progress && (
        <div className="fixed inset-0 z-[9999] bg-gray-900/70 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-lg w-full mx-4">
            {/* Stripe logo + title */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-[#635BFF] flex items-center justify-center">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.18l-.897 5.555C5.014 22.77 7.718 24 11.51 24c2.624 0 4.862-.649 6.334-1.838 1.588-1.28 2.397-3.178 2.397-5.637 0-4.145-2.543-5.827-6.266-7.376z"/>
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Syncing from Stripe</h2>
                <p className="text-sm text-gray-500">Please do not close or navigate away</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#635BFF] rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${overallPercent}%` }}
                />
              </div>
            </div>

            {/* Current phase */}
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-800">
                {PHASE_LABELS[progress.phase] ?? progress.phase}
              </p>
              {progress.detail && (
                <p className="text-xs text-gray-500 mt-0.5">{progress.detail}</p>
              )}
              {progress.current != null && progress.total != null && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {progress.current.toLocaleString()} / {progress.total.toLocaleString()}
                  {progress.elapsed ? ` — ${formatTime(progress.elapsed)} elapsed` : ''}
                  {(() => {
                    const est = estimateRemaining(progress)
                    return est ? ` — ${est}` : ''
                  })()}
                </p>
              )}
            </div>

            {/* Phase checklist */}
            <div className="space-y-2">
              {PHASE_ORDER.filter(p => p !== 'init' && p !== 'done').map((phase, i) => {
                const currentIdx = PHASE_ORDER.indexOf(progress.phase)
                const thisIdx = PHASE_ORDER.indexOf(phase)
                const isComplete = thisIdx < currentIdx
                const isActive = thisIdx === currentIdx
                const isPending = thisIdx > currentIdx

                return (
                  <div key={phase} className="flex items-center gap-2 text-sm">
                    {isComplete && (
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {isActive && (
                      <svg className="w-4 h-4 text-[#635BFF] animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    {isPending && (
                      <div className="w-4 h-4 rounded-full border-2 border-gray-200 flex-shrink-0" />
                    )}
                    <span className={
                      isComplete ? 'text-green-700' :
                      isActive ? 'text-gray-900 font-medium' :
                      'text-gray-400'
                    }>
                      {PHASE_LABELS[phase]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Result notification */}
      {result && !syncing && (
        <div className={`fixed bottom-4 right-4 max-w-md p-4 rounded-lg shadow-lg z-50 ${
          result.ok || result.phase === 'done' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <p className={`text-sm font-medium ${result.ok || result.phase === 'done' ? 'text-green-800' : 'text-red-800'}`}>
            {result.message || result.error || 'Sync complete!'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Page will refresh in a moment...</p>
          <button onClick={() => setResult(null)} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </>
  )
}
