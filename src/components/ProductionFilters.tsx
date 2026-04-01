'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'

interface FilterProps {
  types: Array<{ id: number; name: string; slug: string }>
  statuses: Array<{ id: number; name: string; slug: string }>
  locations: Array<{ label: string; value: string; count: number }>
  resultCount?: number
}

const QUICK_STATUSES = [
  { label: 'Development', slug: 'development' },
  { label: 'Pre-Production', slug: 'pre-production' },
  { label: 'Production', slug: 'production' },
  { label: 'Post-Production', slug: 'post-production' },
]

export function ProductionFilters({ types, statuses, locations, resultCount }: FilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [searchValue, setSearchValue] = useState(searchParams.get('s') ?? '')

  const activeType = searchParams.get('type') ?? ''
  const activeStatus = searchParams.get('status') ?? ''
  const activeLocation = searchParams.get('location') ?? ''
  const activeSort = searchParams.get('sort') ?? 'shoot-date-desc'

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete('page')
      startTransition(() => {
        router.push(`/productions?${params.toString()}`)
      })
    },
    [router, searchParams]
  )

  const clearAll = useCallback(() => {
    setSearchValue('')
    const params = new URLSearchParams(searchParams.toString())
    const view = params.get('view')
    startTransition(() => {
      router.push(view ? `/productions?view=${view}` : '/productions')
    })
  }, [router, searchParams])

  const hasFilters = activeType || activeStatus || activeLocation || searchParams.get('s')

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Search</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            updateFilter('s', searchValue)
          }}
        >
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              name="s"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search productions..."
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-[#3ea8c8] focus:ring-1 focus:ring-[#3ea8c8]/30 outline-none transition-all"
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => { setSearchValue(''); updateFilter('s', '') }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Active Filters */}
      {hasFilters && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-[#3ea8c8] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Results for</span>
            <button
              onClick={clearAll}
              className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              Clear All
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {searchParams.get('s') && (
              <FilterPill label={`"${searchParams.get('s')}"`} onRemove={() => { setSearchValue(''); updateFilter('s', '') }} />
            )}
            {activeType && (
              <FilterPill
                label={types.find(t => t.slug === activeType)?.name ?? activeType}
                onRemove={() => updateFilter('type', '')}
              />
            )}
            {activeStatus && (
              <FilterPill
                label={statuses.find(s => s.slug === activeStatus)?.name ?? activeStatus}
                onRemove={() => updateFilter('status', '')}
              />
            )}
            {activeLocation && (
              <FilterPill
                label={locations.find(l => l.value === activeLocation)?.label ?? activeLocation}
                onRemove={() => updateFilter('location', '')}
              />
            )}
          </div>
        </div>
      )}

      {/* Quick Status Chips */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Filters</h3>
        <div className="flex flex-wrap gap-2">
          {QUICK_STATUSES.map((qs) => {
            const isActive = activeStatus === qs.slug
            return (
              <button
                key={qs.slug}
                onClick={() => updateFilter('status', isActive ? '' : qs.slug)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
                  isActive
                    ? 'bg-[#3ea8c8] text-white border-[#3ea8c8]'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#3ea8c8] hover:text-[#3ea8c8]'
                }`}
              >
                {qs.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Production Type */}
      <CollapsibleFilter title="Production Type" defaultOpen>
        <select
          value={activeType}
          onChange={(e) => updateFilter('type', e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg py-2 px-3 bg-gray-50 focus:bg-white focus:border-[#3ea8c8] focus:ring-1 focus:ring-[#3ea8c8]/30 outline-none transition-all"
        >
          <option value="">All Types</option>
          {types.map((t) => (
            <option key={t.id} value={t.slug}>{t.name}</option>
          ))}
        </select>
      </CollapsibleFilter>

      {/* Status */}
      <CollapsibleFilter title="Status" defaultOpen>
        <select
          value={activeStatus}
          onChange={(e) => updateFilter('status', e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg py-2 px-3 bg-gray-50 focus:bg-white focus:border-[#3ea8c8] focus:ring-1 focus:ring-[#3ea8c8]/30 outline-none transition-all"
        >
          <option value="">All Statuses</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.slug}>{s.name}</option>
          ))}
        </select>
      </CollapsibleFilter>

      {/* Location */}
      <CollapsibleFilter title="Location" defaultOpen>
        <select
          value={activeLocation}
          onChange={(e) => updateFilter('location', e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg py-2 px-3 bg-gray-50 focus:bg-white focus:border-[#3ea8c8] focus:ring-1 focus:ring-[#3ea8c8]/30 outline-none transition-all"
        >
          <option value="">All Locations</option>
          <optgroup label="Major Markets">
            {locations.filter(l => l.count >= 20).map((l) => (
              <option key={l.value} value={l.value}>{l.label} ({l.count})</option>
            ))}
          </optgroup>
          <optgroup label="Other Locations">
            {locations.filter(l => l.count < 20 && l.count >= 3).map((l) => (
              <option key={l.value} value={l.value}>{l.label} ({l.count})</option>
            ))}
          </optgroup>
        </select>
      </CollapsibleFilter>

      {/* Sort */}
      <CollapsibleFilter title="Sort By" defaultOpen={false}>
        <select
          value={activeSort}
          onChange={(e) => updateFilter('sort', e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg py-2 px-3 bg-gray-50 focus:bg-white focus:border-[#3ea8c8] focus:ring-1 focus:ring-[#3ea8c8]/30 outline-none transition-all"
        >
          <option value="shoot-date-desc">Shoot Date (Latest)</option>
          <option value="shoot-date">Shoot Date (Earliest)</option>
          <option value="updated">Last Updated</option>
          <option value="title">Title (A-Z)</option>
          <option value="title-desc">Title (Z-A)</option>
        </select>
      </CollapsibleFilter>

      {/* Loading indicator */}
      {isPending && (
        <div className="flex items-center justify-center gap-2 text-sm text-[#3ea8c8] py-2">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Updating...
        </div>
      )}
    </div>
  )
}

function CollapsibleFilter({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</h3>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 -mt-1">{children}</div>}
    </div>
  )
}

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-[#3ea8c8]/10 text-[#3ea8c8] text-xs font-medium px-2.5 py-1 rounded-full">
      {label}
      <button onClick={onRemove} className="hover:text-red-500 ml-0.5 transition-colors" aria-label={`Remove ${label}`}>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  )
}

export default ProductionFilters
