'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PHASE_LABELS, PHASE_COLORS, formatDate } from '@/lib/utils'
import type { ProductionPhase } from '@/types/database'
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton'

interface Production {
  id: number
  title: string
  slug: string
  computed_status: string | null
  visibility: string
  production_date_start: string | null
  wp_updated_at: string | null
  updated_at: string | null
  created_at: string
}

interface Props {
  productions: Production[]
  currentTab: string
}

const BULK_ACTIONS = [
  { value: 'publish', label: 'Publish', color: 'bg-green-600 hover:bg-green-700' },
  { value: 'draft', label: 'Set as Draft', color: 'bg-yellow-500 hover:bg-yellow-600' },
  { value: 'members_only', label: 'Members Only', color: 'bg-blue-600 hover:bg-blue-700' },
  { value: 'trash', label: 'Move to Trash', color: 'bg-red-500 hover:bg-red-600' },
  { value: 'delete', label: 'Delete Permanently', color: 'bg-red-700 hover:bg-red-800' },
]

export function ProductionsTableClient({ productions, currentTab }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<{ ok?: boolean; message?: string } | null>(null)

  const canMerge = selected.size === 2

  function startMerge() {
    const ids = Array.from(selected).sort((a, b) => a - b)
    router.push(`/admin/productions/merge?ids=${ids.join(',')}`)
  }

  const allIds = productions.map(p => p.id)
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id))
  const someSelected = selected.size > 0

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(allIds))
    }
  }

  function toggleOne(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkAction(action: string) {
    const count = selected.size
    const actionLabel = BULK_ACTIONS.find(a => a.value === action)?.label ?? action

    const confirmMsg = action === 'delete'
      ? `Permanently delete ${count} production${count !== 1 ? 's' : ''}? This cannot be undone.`
      : action === 'publish'
        ? `Publish ${count} production${count !== 1 ? 's' : ''}? They will be added to this week's production list and supplements will auto-fill to 40+.`
        : `${actionLabel} ${count} production${count !== 1 ? 's' : ''}?`

    if (!confirm(confirmMsg)) return

    setProcessing(true)
    setResult(null)

    try {
      const res = await fetch('/api/admin/bulk-update-productions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), action }),
      })
      const data = await res.json()
      setResult({ ok: data.ok, message: data.message })
      if (data.ok) {
        setSelected(new Set())
        // Reload to reflect changes
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch (err: any) {
      setResult({ ok: false, message: err.message || 'An error occurred.' })
    }
    setProcessing(false)
  }

  return (
    <div>
      {/* Bulk action bar */}
      {someSelected && (
        <div className="mb-4 bg-[#3ea8c8]/5 border border-[#3ea8c8]/20 rounded-lg p-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-gray-700">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {canMerge && (
              <button
                type="button"
                onClick={startMerge}
                className="text-xs text-white px-3 py-1.5 rounded-md font-medium transition-colors bg-purple-600 hover:bg-purple-700 flex items-center gap-1"
                title="Merge these two productions into one"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7l4-4m0 0l4 4m-4-4v18" />
                </svg>
                Merge Selected
              </button>
            )}
            {BULK_ACTIONS.map(action => {
              // Hide irrelevant actions based on current tab
              if (currentTab === 'publish' && action.value === 'publish') return null
              if (currentTab === 'trash' && (action.value === 'trash')) return null
              if (currentTab !== 'trash' && action.value === 'delete') return null

              return (
                <button
                  key={action.value}
                  type="button"
                  onClick={() => handleBulkAction(action.value)}
                  disabled={processing}
                  className={`text-xs text-white px-3 py-1.5 rounded-md font-medium transition-colors ${action.color} disabled:opacity-50`}
                >
                  {processing ? 'Processing...' : action.label}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-gray-500 hover:text-gray-700"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="admin-card p-0 overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-gray-300 text-[#3ea8c8] focus:ring-[#3ea8c8]"
                  title={allSelected ? 'Deselect all' : 'Select all on this page'}
                />
              </th>
              <th className="w-16">ID</th>
              <th>Title</th>
              <th>Status</th>
              <th>Visibility</th>
              <th>Start Date</th>
              <th>Updated</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {productions.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-gray-400 py-10">
                  No productions found.
                </td>
              </tr>
            ) : (
              productions.map((p) => {
                const phase = p.computed_status as ProductionPhase
                const isSelected = selected.has(p.id)
                return (
                  <tr key={p.id} className={isSelected ? 'bg-[#3ea8c8]/5' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(p.id)}
                        className="rounded border-gray-300 text-[#3ea8c8] focus:ring-[#3ea8c8]"
                      />
                    </td>
                    <td className="text-gray-400 text-xs w-16">{p.id}</td>
                    <td>
                      <Link
                        href={`/admin/productions/${p.id}/edit`}
                        className="font-medium text-primary hover:underline"
                      >
                        {p.title}
                      </Link>
                    </td>
                    <td>
                      {phase ? (
                        <span className={`production-status-badge ${PHASE_COLORS[phase]}`}>
                          {PHASE_LABELS[phase]}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      <span className={`badge ${
                        p.visibility === 'publish' ? 'badge-green'
                          : p.visibility === 'members_only' ? 'badge-blue'
                          : 'badge-gray'
                      }`}>
                        {p.visibility === 'publish' ? 'Published' : p.visibility === 'private' ? 'Draft' : p.visibility}
                      </span>
                    </td>
                    <td className="text-xs text-gray-500 whitespace-nowrap">
                      {p.production_date_start || '—'}
                    </td>
                    <td className="text-xs text-gray-500 whitespace-nowrap">
                      {formatDate(p.updated_at ?? p.wp_updated_at)}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/admin/productions/${p.id}/edit`}
                        className="text-xs btn-outline py-1 px-2"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Result toast */}
      {result && (
        <div className={`fixed bottom-6 right-6 max-w-md p-4 rounded-lg shadow-lg border z-50 ${
          result.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-start gap-2">
            <span className="text-sm">{result.message}</span>
            <button onClick={() => setResult(null)} className="text-xs ml-2 hover:opacity-70">&times;</button>
          </div>
        </div>
      )}
    </div>
  )
}
