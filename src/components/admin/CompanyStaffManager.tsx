'use client'

import { useState, useRef } from 'react'

interface StaffEntry {
  id: number
  crew_id: number
  position: string | null
  sort_order: number
  crew_members: { id: number; name: string; slug: string }
}

interface Props {
  companyId: number
  initialStaff: StaffEntry[]
}

export function CompanyStaffManager({ companyId, initialStaff }: Props) {
  const [staff, setStaff] = useState<StaffEntry[]>(initialStaff)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [newPosition, setNewPosition] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editPosition, setEditPosition] = useState('')
  const [saving, setSaving] = useState(false)
  const searchTimer = useRef<NodeJS.Timeout | null>(null)

  async function handleSearch(q: string) {
    setSearchQuery(q)
    if (q.length < 2) { setSearchResults([]); return }

    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/admin/company-staff?q=${encodeURIComponent(q)}`)
        const { results } = await res.json()
        // Filter out already-added crew
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
                      href={`/admin/crew/${s.crew_members?.id}`}
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

      {staff.length === 0 && (
        <p className="text-sm text-gray-400 italic">No staff members associated yet.</p>
      )}

      {/* Add staff */}
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
