'use client'

import { useState } from 'react'

interface BackfillResult {
  ok: boolean
  dryRun: boolean
  weeksProcessed: number
  totalAdded: number
  message: string
  details: Array<{ week: string; before: number; added: number; after: number }>
}

export function BackfillButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BackfillResult | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  async function handleDryRun() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/weekly-backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      })
      const data = await res.json()
      setResult(data)
      if (data.totalAdded > 0) setShowConfirm(true)
    } catch {
      setResult({ ok: false, dryRun: true, weeksProcessed: 0, totalAdded: 0, message: 'Request failed', details: [] })
    }
    setLoading(false)
  }

  async function handleBackfill() {
    setLoading(true)
    setShowConfirm(false)
    setResult(null)
    try {
      const res = await fetch('/api/admin/weekly-backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      })
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ ok: false, dryRun: false, weeksProcessed: 0, totalAdded: 0, message: 'Request failed', details: [] })
    }
    setLoading(false)
  }

  return (
    <div>
      <button
        onClick={handleDryRun}
        disabled={loading}
        className="btn-outline text-sm"
      >
        {loading ? 'Processing...' : 'Backfill All Weeks < 40'}
      </button>

      {result && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">
                {result.dryRun ? 'Backfill Preview' : 'Backfill Complete'}
              </h3>
              <p className="text-sm text-gray-500 mt-1">{result.message}</p>
            </div>

            {result.details.length > 0 && (
              <div className="overflow-auto flex-1 px-5 py-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 text-xs uppercase">
                      <th className="pb-2">Week</th>
                      <th className="pb-2 text-center">Before</th>
                      <th className="pb-2 text-center">+Added</th>
                      <th className="pb-2 text-center">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.details.map((d) => (
                      <tr key={d.week} className="border-t border-gray-100">
                        <td className="py-1.5 font-medium">{d.week}</td>
                        <td className="py-1.5 text-center text-gray-500">{d.before}</td>
                        <td className="py-1.5 text-center text-green-600 font-semibold">+{d.added}</td>
                        <td className="py-1.5 text-center font-semibold">{d.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              {showConfirm && result.dryRun ? (
                <>
                  <button onClick={() => { setResult(null); setShowConfirm(false) }} className="btn-outline text-sm">
                    Cancel
                  </button>
                  <button onClick={handleBackfill} disabled={loading} className="btn-primary text-sm">
                    {loading ? 'Running...' : `Backfill ${result.weeksProcessed} Weeks`}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setResult(null); setShowConfirm(false); if (!result.dryRun) window.location.reload() }}
                  className="btn-primary text-sm"
                >
                  {result.dryRun ? 'Close' : 'Done'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
