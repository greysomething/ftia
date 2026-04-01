'use client'

import { useState } from 'react'
import Link from 'next/link'

interface WeekEntry {
  monday: string
  count: number
}

interface Props {
  weeks: WeekEntry[]
  currentMonday: string
}

export function WeeklyListsTable({ weeks, currentMonday }: Props) {
  const [selectedWeeks, setSelectedWeeks] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const allSelected = weeks.length > 0 && selectedWeeks.size === weeks.length
  const someSelected = selectedWeeks.size > 0

  function toggleAll() {
    if (allSelected) {
      setSelectedWeeks(new Set())
    } else {
      setSelectedWeeks(new Set(weeks.map(w => w.monday)))
    }
  }

  function toggleWeek(monday: string) {
    setSelectedWeeks(prev => {
      const next = new Set(prev)
      if (next.has(monday)) next.delete(monday)
      else next.add(monday)
      return next
    })
  }

  async function handleDeleteSelected() {
    if (selectedWeeks.size === 0) return
    const weeksList = Array.from(selectedWeeks)
    const confirmed = confirm(
      `Are you sure you want to delete ${weeksList.length} weekly list(s)? This will remove all production entries from those weeks.`
    )
    if (!confirmed) return

    setDeleting(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/clear-week', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeks: weeksList }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(data.message)
        setSelectedWeeks(new Set())
        // Refresh the page to show updated data
        setTimeout(() => window.location.reload(), 500)
      } else {
        setMessage(data.error ?? 'Delete failed.')
      }
    } catch {
      setMessage('Network error.')
    } finally {
      setDeleting(false)
    }
  }

  const fmt = (d: Date) => d.toLocaleDateString('en-US', {
    month: 'Short', day: 'numeric', year: 'numeric',
  })

  return (
    <>
      {/* Bulk action bar */}
      {someSelected && (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-4 flex items-center justify-between shadow-sm">
          <span className="text-sm font-medium text-gray-700">
            {selectedWeeks.size} week{selectedWeeks.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {deleting ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Deleting...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete Selected
                </>
              )}
            </button>
            <button
              onClick={() => setSelectedWeeks(new Set())}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.includes('error') || message.includes('fail')
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-green-50 border border-green-200 text-green-700'
        }`}>
          {message}
        </div>
      )}

      <div className="admin-card p-0 overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                />
              </th>
              <th>Week</th>
              <th>Date Range</th>
              <th className="text-center">Productions</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {weeks.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-gray-400 py-10">
                  No weekly lists yet. Save a production or use &ldquo;Snapshot This Week&rdquo; to get started.
                </td>
              </tr>
            ) : weeks.map((w) => {
              const mondayDate = new Date(w.monday + 'T00:00:00')
              const sundayDate = new Date(mondayDate)
              sundayDate.setDate(mondayDate.getDate() + 6)
              const isCurrentWeek = w.monday === currentMonday
              const isSelected = selectedWeeks.has(w.monday)

              const fmtDate = (d: Date) => d.toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })

              return (
                <tr key={w.monday} className={`${isCurrentWeek ? 'bg-blue-50/50' : ''} ${isSelected ? 'bg-blue-50' : ''}`}>
                  <td>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleWeek(w.monday)}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </td>
                  <td>
                    <span className="font-medium text-gray-900">
                      {mondayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {isCurrentWeek && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 uppercase">
                        Current
                      </span>
                    )}
                  </td>
                  <td className="text-gray-500 text-sm">
                    {fmtDate(mondayDate)} &ndash; {fmtDate(sundayDate)}
                  </td>
                  <td className="text-center">
                    <span className={`inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-semibold ${
                      w.count < 40 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {w.count}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/weekly-lists/${w.monday}`}
                        className="text-xs btn-primary py-1 px-2"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/productions/week/${w.monday}`}
                        target="_blank"
                        className="text-xs btn-outline py-1 px-2"
                      >
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
