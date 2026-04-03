'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

const SORT_OPTIONS = [
  { value: 'shoot-date-desc', label: 'Shoot Date (Latest)' },
  { value: 'shoot-date', label: 'Shoot Date (Earliest)' },
  { value: 'updated', label: 'Last Updated' },
  { value: 'title', label: 'Title (A–Z)' },
  { value: 'title-desc', label: 'Title (Z–A)' },
]

const COLUMN_SORT_MAP: Record<string, { asc: string; desc: string; label: string }> = {
  title: { asc: 'title', desc: 'title-desc', label: 'Title' },
  'shoot-date': { asc: 'shoot-date', desc: 'shoot-date-desc', label: 'Shoot Date' },
}

export function SortDropdown() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const activeSort = searchParams.get('sort') ?? 'shoot-date-desc'

  function updateSort(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'shoot-date-desc') {
      params.set('sort', value)
    } else {
      params.delete('sort')
    }
    params.delete('page')
    startTransition(() => {
      router.push(`/productions?${params.toString()}`)
    })
  }

  return (
    <div className="flex items-center gap-2">
      {isPending && (
        <svg className="w-3.5 h-3.5 animate-spin text-[#3ea8c8]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      <select
        value={activeSort}
        onChange={e => updateSort(e.target.value)}
        className="text-xs border border-gray-200 rounded-lg py-1.5 px-2.5 bg-gray-50 focus:bg-white focus:border-[#3ea8c8] focus:ring-1 focus:ring-[#3ea8c8]/30 outline-none transition-all text-gray-600 cursor-pointer"
      >
        {SORT_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

export function SortableHeader({
  children,
  columnKey,
}: {
  children: React.ReactNode
  columnKey: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const activeSort = searchParams.get('sort') ?? 'shoot-date-desc'

  const mapping = COLUMN_SORT_MAP[columnKey]
  if (!mapping) return <>{children}</>

  const isAsc = activeSort === mapping.asc
  const isDesc = activeSort === mapping.desc
  const isActive = isAsc || isDesc

  function handleClick() {
    const params = new URLSearchParams(searchParams.toString())
    // Toggle: if desc → asc, if asc → desc, if inactive → asc
    const next = isDesc ? mapping.asc : mapping.desc
    if (next === 'shoot-date-desc') {
      params.delete('sort')
    } else {
      params.set('sort', next)
    }
    params.delete('page')
    startTransition(() => {
      router.push(`/productions?${params.toString()}`)
    })
  }

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors group ${
        isActive ? 'text-[#3ea8c8]' : 'text-gray-400 hover:text-gray-600'
      }`}
    >
      {children}
      <span className={`transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
        {isAsc ? (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </span>
    </button>
  )
}
