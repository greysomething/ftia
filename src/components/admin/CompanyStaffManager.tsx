'use client'

import { useState, useRef, useEffect } from 'react'

interface StaffEntry {
  id: number
  crew_id: number
  position: string | null
  sort_order: number
  crew_members: { id: number; name: string; slug: string }
}

interface AIStaffSuggestion {
  name: string
  position: string | null
  confidence: number
}

interface Props {
  companyId: number
  initialStaff: StaffEntry[]
  aiSuggestedStaff?: AIStaffSuggestion[]
  onAiStaffProcessed?: () => void
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100)
  let color = 'bg-green-100 text-green-700 border-green-200'
  let label = 'High'
  if (confidence < 0.7) {
    color = 'bg-amber-100 text-amber-700 border-amber-200'
    label = 'Medium'
  } else if (confidence < 0.9) {
    color = 'bg-blue-100 text-blue-700 border-blue-200'
    label = 'Good'
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${color}`}
      title={`AI confidence: ${pct}%`}>
      {label} {pct}%
    </span>
  )
}

export function CompanyStaffManager({ companyId, initialStaff, aiSuggestedStaff, onAiStaffProcessed }: Props) {
  const [staff, setStaff] = useState<StaffEntry[]>(initialStaff)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [newPosition, setNewPosition] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editPosition, setEditPosition] = useState('')
  const [saving, setSaving] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<AIStaffSuggestion[]>([])
  const [addingAiStaff, setAddingAiStaff] = useState<string | null>(null)
  const searchTimer = useRef<NodeJS.Timeout | null>(null)

  // When AI suggestions arrive, show them
  useEffect(() => {
    if (aiSuggestedStaff && aiSuggestedStaff.length > 0) {
      setAiSuggestions(aiSuggestedStaff)
    }
  }, [aiSuggestedStaff])

  async function handleSearch(q: string) {
    setSearchQuery(q)
    if (q.length < 2) { setSearchResults([]); return }

    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/admin/company-staff?q=${encodeURIComponent(q)}`)
        const { results } = await res.json()
        const existingIds = new Set(staff.map(s => s.crew_id))
        setSearchResults((results ?? []).filter((r: any) => !existingIds.has(r.id)))
      } catch { setSearchResults([]) }
      setSearching(false)
    }, 300)
  }

  async function addStaff(crewMember: { id: number; name: string; slug: string }) {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/company-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          crew_id: crewMember.id,
          position: newPosition || null,
        }),
      })
      const { staff: newEntry } = await res.json()
      if (newEntry) {
        setStaff(prev => [...prev, newEntry])
        setSearchQuery('')
        setSearchResults([])
        setNewPosition('')
      }
    } catch (e) {
      console.error('Error adding staff:', e)
    }
    setSaving(false)
  }

  async function addAiStaff(suggestion: AIStaffSuggestion) {
    setAddingAiStaff(suggestion.name)
    try {
      // Look for an existing crew member by name first.
      const searchRes = await fetch(`/api/admin/company-staff?q=${encodeURIComponent(suggestion.name)}`)
      const { results } = await searchRes.json()

      // Prefer an exact (case-insensitive) match. Fall back to the first result
      // only if the company doesn't already have it linked.
      const exactMatch = (results ?? []).find((r: any) =>
        r.name.toLowerCase() === suggestion.name.toLowerCase().trim()
      )

      let payload: Record<string, any>
      if (exactMatch) {
        // Already linked? Bail before re-inserting.
        if (staff.some(s => s.crew_id === exactMatch.id)) {
          setAiSuggestions(prev => prev.filter(s => s.name !== suggestion.name))
          setAddingAiStaff(null)
          return
        }
        payload = {
          company_id: companyId,
          crew_id: exactMatch.id,
          position: suggestion.position || null,
        }
      } else {
        // No existing crew row — ask the API to create one (as draft) then link.
        payload = {
          company_id: companyId,
          name: suggestion.name,
          position: suggestion.position || null,
          confidence: suggestion.confidence,
        }
      }

      const res = await fetch('/api/admin/company-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        // Don't dismiss the suggestion on failure — let the admin retry.
        console.error('[CompanyStaffManager] Failed to add staff:', json.error)
        alert(`Could not add ${suggestion.name}: ${json.error ?? 'unknown error'}`)
        setAddingAiStaff(null)
        return
      }
      if (json.staff) {
        setStaff(prev => [...prev, json.staff])
      }
      setAiSuggestions(prev => prev.filter(s => s.name !== suggestion.name))
    } catch (e: any) {
      console.error('Error adding AI staff:', e)
      alert(`Could not add ${suggestion.name}: ${e?.message ?? 'network error'}`)
    }
    setAddingAiStaff(null)
  }

  async function addAllAiStaff() {
    for (const suggestion of aiSuggestions) {
      await addAiStaff(suggestion)
    }
    onAiStaffProcessed?.()
  }

  function dismissAiSuggestion(name: string) {
    setAiSuggestions(prev => prev.filter(s => s.name !== name))
  }

  function dismissAllAiSuggestions() {
    setAiSuggestions([])
    onAiStaffProcessed?.()
  }

  async function removeStaff(id: number) {
    if (!confirm('Remove this staff member?')) return
    try {
      await fetch('/api/admin/company-staff', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setStaff(prev => prev.filter(s => s.id !== id))
    } catch (e) {
      console.error('Error removing staff:', e)
    }
  }

  async function updatePosition(id: number) {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/company-staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, position: editPosition }),
      })
      const { staff: updated } = await res.json()
      if (updated) {
        setStaff(prev => prev.map(s => s.id === id ? updated : s))
      }
      setEditingId(null)
    } catch (e) {
      console.error('Error updating position:', e)
    }
    setSaving(false)
  }

  return (
    <div className="admin-card space-y-4">
      <h2 className="font-semibold text-gray-700 flex items-center gap-2">
        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Key Staff
        <span className="text-xs font-normal text-gray-400">({staff.length})</span>
      </h2>

      {/* AI Suggested Staff */}
      {aiSuggestions.length > 0 && (
        <div className="border border-purple-200 bg-purple-50/50 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="text-sm font-semibold text-purple-800">
                AI Found {aiSuggestions.length} Staff Member{aiSuggestions.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={addAllAiStaff}
                disabled={!!addingAiStaff}
                className="text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 px-2.5 py-1 rounded border border-purple-300 transition-colors disabled:opacity-50"
              >
                {addingAiStaff ? 'Adding...' : 'Add All'}
              </button>
              <button
                onClick={dismissAllAiSuggestions}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
              >
                Dismiss
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {aiSuggestions.map(s => (
              <div key={s.name} className="flex items-center justify-between bg-white rounded border border-purple-100 px-3 py-2">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-600 flex-shrink-0">
                    {s.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-gray-900">{s.name}</span>
                    {s.position && (
                      <span className="text-xs text-gray-500 ml-2">— {s.position}</span>
                    )}
                  </div>
                  <ConfidenceBadge confidence={s.confidence} />
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => addAiStaff(s)}
                    disabled={addingAiStaff === s.name}
                    className="text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-2 py-1 rounded border border-green-200 transition-colors disabled:opacity-50"
                  >
                    {addingAiStaff === s.name ? 'Adding...' : 'Add'}
                  </button>
                  <button
                    onClick={() => dismissAiSuggestion(s.name)}
                    className="text-xs text-gray-400 hover:text-red-500 px-1 py-1"
                    title="Dismiss"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-purple-500">
            Review confidence scores before adding. High = verified, Good = likely accurate, Medium = may need verification.
          </p>
        </div>
      )}

      {/* Current staff list */}
      {staff.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500 text-xs uppercase">Name</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500 text-xs uppercase">Position</th>
                <th className="w-20 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <a
                      href={`/admin/crew/${s.crew_members?.id}/edit`}
                      className="font-medium text-gray-800 hover:text-blue-600"
                      target="_blank"
                    >
                      {s.crew_members?.name ?? 'Unknown'}
                    </a>
                  </td>
                  <td className="px-3 py-2">
                    {editingId === s.id ? (
                      <div className="flex gap-1">
                        <input
                          value={editPosition}
                          onChange={e => setEditPosition(e.target.value)}
                          className="form-input py-1 text-sm flex-1"
                          placeholder="Position title"
                          onKeyDown={e => e.key === 'Enter' && updatePosition(s.id)}
                        />
                        <button
                          onClick={() => updatePosition(s.id)}
                          disabled={saving}
                          className="text-xs text-green-600 hover:text-green-700 font-medium px-1"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-gray-400 hover:text-gray-600 px-1"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span
                        className="text-gray-500 cursor-pointer hover:text-gray-700"
                        onClick={() => { setEditingId(s.id); setEditPosition(s.position ?? '') }}
                        title="Click to edit position"
                      >
                        {s.position || <span className="text-gray-300 italic">Click to set position</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => removeStaff(s.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                      title="Remove staff"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {staff.length === 0 && aiSuggestions.length === 0 && (
        <p className="text-sm text-gray-400 italic">No staff members associated yet.</p>
      )}

      {/* Add staff manually */}
      <div className="border border-dashed border-gray-300 rounded-lg p-3 space-y-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Add Staff Member</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search people by name..."
              className="form-input text-sm"
            />
            {searching && (
              <div className="absolute right-2 top-2.5">
                <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
            {searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => addStaff(r)}
                    disabled={saving}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2"
                  >
                    <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                      {r.name.charAt(0)}
                    </span>
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            type="text"
            value={newPosition}
            onChange={e => setNewPosition(e.target.value)}
            placeholder="Position (e.g. Producer, President)"
            className="form-input text-sm"
          />
        </div>
      </div>
    </div>
  )
}
