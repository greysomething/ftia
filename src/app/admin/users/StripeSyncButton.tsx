'use client'

import { useState } from 'react'

export function StripeSyncButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  async function handleSync() {
    if (!confirm(
      'Sync all memberships from Stripe?\n\n' +
      'This will:\n' +
      '• Fetch all active, canceled, trialing & past-due subscriptions from Stripe\n' +
      '• Create Supabase accounts for any new users (by email)\n' +
      '• Create/update membership records for each subscription\n\n' +
      'This may take 1-2 minutes for large subscriber bases.'
    )) return

    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/sync-stripe-subscriptions', { method: 'POST' })
      const data = await res.json()
      setResult(data)
      if (data.ok) {
        setTimeout(() => window.location.reload(), 2500)
      }
    } catch {
      setResult({ error: 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={handleSync} disabled={loading}
        className="btn-outline flex items-center gap-2 text-sm">
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Syncing from Stripe…
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

      {result && (
        <div className={`fixed bottom-4 right-4 max-w-md p-4 rounded-lg shadow-lg z-50 ${
          result.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <p className={`text-sm font-medium ${result.ok ? 'text-green-800' : 'text-red-800'}`}>
            {result.message || result.error}
          </p>
          {result.byStatus && (
            <div className="mt-2 text-xs text-gray-600 space-y-0.5">
              <div>Active: {result.byStatus.active} | Trialing: {result.byStatus.trialing} | Canceled: {result.byStatus.canceled} | Past Due: {result.byStatus.past_due}</div>
              <div>New accounts created: {result.usersCreated} | Skipped: {result.skipped}</div>
              {result.errors?.length > 0 && (
                <details className="mt-1">
                  <summary className="text-red-600 cursor-pointer">{result.errors.length} errors</summary>
                  <div className="mt-1 max-h-32 overflow-y-auto text-[10px] text-red-500 space-y-0.5">
                    {result.errors.slice(0, 20).map((e: string, i: number) => <div key={i}>{e}</div>)}
                  </div>
                </details>
              )}
            </div>
          )}
          <button onClick={() => setResult(null)} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
