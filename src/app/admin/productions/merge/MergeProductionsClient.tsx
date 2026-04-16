'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Props {
  ids: number[]
}

interface Conflict { field: string; values: [any, any] }
interface Preview {
  productions: any[]
  conflicts: Conflict[]
  autoMerged: Record<string, any>
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  slug: 'URL Slug',
  content: 'Content',
  excerpt: 'Excerpt / Synopsis',
  production_date_start: 'Start Date',
  production_date_end: 'End Date',
  production_date_startpost: 'Post Start',
  production_date_endpost: 'Post End',
  computed_status: 'Phase',
}

function fieldDisplay(value: any): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string' && value.length > 200) return value.slice(0, 200) + '…'
  return String(value)
}

export function MergeProductionsClient({ ids }: Props) {
  const router = useRouter()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Selected primary (kept) — defaults to the first
  const [keptIndex, setKeptIndex] = useState<0 | 1>(0)
  // Per-field choice for conflicts: 0 = use first production's value, 1 = use second
  const [fieldChoices, setFieldChoices] = useState<Record<string, 0 | 1>>({})

  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<{ logId?: number; keptSlug?: string; mergedSlug?: string } | null>(null)
  const [undoing, setUndoing] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/productions/merge-preview?ids=${ids.join(',')}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) throw new Error(d.error || 'Failed to load preview')
        setPreview(d)
        // Default each conflict to "use the kept production's value"
        const defaults: Record<string, 0 | 1> = {}
        for (const c of d.conflicts) defaults[c.field] = 0
        setFieldChoices(defaults)
      })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false))
  }, [ids.join(',')])

  async function executeMerge() {
    if (!preview) return
    const keptId = preview.productions[keptIndex].id
    const mergedId = preview.productions[1 - keptIndex].id

    // Build final field values: for conflicts, take the picked side; for auto-merged, take what was auto-picked
    const fields: Record<string, any> = { ...preview.autoMerged }
    for (const c of preview.conflicts) {
      const choice = fieldChoices[c.field] ?? 0
      // choice is relative to the displayed order [0, 1] — but we're keeping `keptIndex`'s id,
      // and we want the chosen value regardless of which is kept
      fields[c.field] = c.values[choice]
    }

    if (!confirm(`Merge production #${mergedId} into #${keptId}? The other production will be moved to trash and a slug redirect will be created. You can undo this within 30 days.`)) return

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/productions/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keptId, mergedId, fields }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Merge failed')
      setSuccess({ logId: data.logId, keptSlug: data.keptSlug, mergedSlug: data.mergedSlug })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function undoMerge() {
    if (!success?.logId) return
    if (!confirm('Undo this merge? The trashed production will be restored. Note: any relations that were combined into the kept production will NOT be removed automatically — review afterward.')) return
    setUndoing(true)
    try {
      const res = await fetch('/api/admin/productions/merge-undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId: success.logId }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Undo failed')
      alert(`Restored production #${data.restoredId}.\n\n${data.note}`)
      router.push('/admin/productions')
    } catch (e: any) {
      alert(`Undo failed: ${e.message}`)
    } finally {
      setUndoing(false)
    }
  }

  if (loading) return <div className="admin-card p-6 text-sm text-gray-500">Loading productions…</div>

  if (error && !preview) {
    return (
      <div className="admin-card p-6 bg-red-50 border-red-200">
        <p className="text-sm text-red-800 font-medium">Error: {error}</p>
        <Link href="/admin/productions" className="text-sm text-red-700 underline mt-2 inline-block">← Back</Link>
      </div>
    )
  }

  if (!preview) return null

  if (success) {
    return (
      <div className="admin-card p-6 space-y-4 bg-green-50 border-green-200">
        <div className="flex items-center gap-2 text-green-800 font-semibold text-lg">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          Merge complete
        </div>
        <div className="text-sm text-gray-700 space-y-2">
          <p>
            The two productions have been merged. The kept production is at slug{' '}
            <code className="bg-white px-2 py-0.5 rounded border">/production/{success.keptSlug}</code>.
          </p>
          {success.mergedSlug && success.mergedSlug !== success.keptSlug && (
            <p>
              A 301 redirect from <code className="bg-white px-2 py-0.5 rounded border">/production/{success.mergedSlug}</code>{' '}
              now points to the kept production.
            </p>
          )}
          <p>The losing production has been moved to trash and is recoverable.</p>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Link href={`/production/${success.keptSlug}`} target="_blank" className="btn-outline text-sm">
            View kept production →
          </Link>
          <Link href="/admin/productions" className="btn-primary text-sm">
            Back to productions
          </Link>
          {success.logId && (
            <button onClick={undoMerge} disabled={undoing}
              className="ml-auto text-sm text-red-600 hover:text-red-800 underline disabled:opacity-50">
              {undoing ? 'Undoing…' : 'Undo merge'}
            </button>
          )}
        </div>
      </div>
    )
  }

  const [a, b] = preview.productions

  return (
    <div className="space-y-6">
      {/* Pick which is "kept" */}
      <div className="admin-card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Step 1 — Which production should be kept?</h2>
        <p className="text-xs text-gray-500">The kept production keeps its ID. The other goes to trash. A slug redirect is created if slugs differ.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[a, b].map((p, i) => (
            <button key={p.id} type="button" onClick={() => setKeptIndex(i as 0 | 1)}
              className={`text-left border rounded-lg p-3 transition-colors ${
                keptIndex === i ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-300' : 'border-gray-200 hover:border-gray-300'
              }`}>
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full border-2 ${keptIndex === i ? 'bg-purple-500 border-purple-500' : 'border-gray-300'}`} />
                <span className="text-xs text-gray-400">#{p.id}</span>
                <span className={`badge text-[10px] ${p.visibility === 'publish' ? 'badge-green' : 'badge-gray'}`}>
                  {p.visibility}
                </span>
              </div>
              <div className="font-medium text-gray-900 mt-1">{p.title}</div>
              <div className="text-xs text-gray-500 mt-0.5">/{p.slug}</div>
              <div className="text-[11px] text-gray-400 mt-1">
                Updated {p.wp_updated_at ? new Date(p.wp_updated_at).toLocaleDateString() : '—'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Conflicts */}
      {preview.conflicts.length > 0 && (
        <div className="admin-card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">
            Step 2 — Resolve {preview.conflicts.length} conflicting field{preview.conflicts.length === 1 ? '' : 's'}
          </h2>
          <p className="text-xs text-gray-500">Both productions have a value for these fields and the values differ. Pick which to keep.</p>
          <div className="space-y-2">
            {preview.conflicts.map(c => (
              <div key={c.field} className="border rounded-lg p-3 bg-gray-50">
                <div className="text-xs font-medium text-gray-600 mb-2">{FIELD_LABELS[c.field] ?? c.field}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {[0, 1].map(i => (
                    <button key={i} type="button" onClick={() => setFieldChoices(prev => ({ ...prev, [c.field]: i as 0 | 1 }))}
                      className={`text-left border rounded p-2 text-sm transition-colors ${
                        fieldChoices[c.field] === i ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-300' : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}>
                      <div className="text-[10px] text-gray-400 mb-1">From #{preview.productions[i].id}</div>
                      <div className="text-gray-800 break-words">{fieldDisplay(c.values[i])}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Auto-merged summary */}
      <div className="admin-card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">
          {preview.conflicts.length > 0 ? 'Step 3 — Review auto-merged data' : 'Step 2 — Review auto-merged data'}
        </h2>
        <p className="text-xs text-gray-500">These fields and relations are combined automatically.</p>

        {/* Auto-picked scalar fields */}
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">Scalar fields ({Object.keys(preview.autoMerged).filter(k => preview.autoMerged[k] != null && preview.autoMerged[k] !== '').length})</summary>
          <div className="mt-2 space-y-1 pl-4">
            {Object.entries(preview.autoMerged).map(([k, v]) => (
              <div key={k} className="text-xs text-gray-600">
                <span className="font-medium text-gray-700">{FIELD_LABELS[k] ?? k}:</span>{' '}
                <span className="text-gray-500">{fieldDisplay(v)}</span>
              </div>
            ))}
          </div>
        </details>

        {/* Relations summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          {[
            ['Types', 'production_type_links'],
            ['Statuses', 'production_status_links'],
            ['Locations', 'production_locations'],
            ['Companies', 'production_company_links'],
            ['Crew', 'production_crew_roles'],
          ].map(([label, key]) => {
            const aCount = (a[key] ?? []).length
            const bCount = (b[key] ?? []).length
            return (
              <div key={key} className="bg-gray-50 rounded p-2 text-center">
                <div className="text-[10px] text-gray-400 uppercase">{label}</div>
                <div className="text-gray-700 mt-1">#{a.id}: {aCount}</div>
                <div className="text-gray-700">#{b.id}: {bCount}</div>
                <div className="text-purple-600 font-medium mt-1">→ combined</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Action bar */}
      <div className="sticky bottom-0 bg-gray-100 border-t border-gray-200 -mx-6 px-6 py-4 flex items-center gap-3">
        <button type="button" onClick={executeMerge} disabled={submitting}
          className="btn-primary bg-purple-600 hover:bg-purple-700 disabled:opacity-50">
          {submitting ? 'Merging…' : `Merge into #${preview.productions[keptIndex].id}`}
        </button>
        <Link href="/admin/productions" className="btn-outline">Cancel</Link>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  )
}
