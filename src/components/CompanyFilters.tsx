'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'

interface CompanyFiltersProps {
  categories: Array<{ id: number; name: string; slug: string }>
  resultCount?: number
}

export function CompanyFilters({ categories, resultCount }: CompanyFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [searchValue, setSearchValue] = useState(searchParams.get('s') ?? '')

  const activeCategory = searchParams.get('category') ?? ''
  const activeSort = searchParams.get('sort') ?? 'az'

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
        router.push(`/production-contact?${params.toString()}`)
      })
    },
    [router, searchParams]
  )

  const clearAll = useCallback(() => {
    setSearchValue('')
    startTransition(() => {
      router.push('/production-contact')
    })
  }, [router])

  const hasFilters = activeCategory || searchParams.get('s')

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
              placeholder="Search companies..."
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
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Active Filters</span>
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
            {activeCategory && (
              <FilterPill
                label={categories.find(c => c.slug === activeCategory)?.name ?? activeCategory}
                onRemove={() => updateFilter('category', '')}
              />
            )}
          </div>
        </div>
      )}

      {/* Category Pills */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Category</h3>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.slug
            return (
              <button
                key={cat.id}
                onClick={() => updateFilter('category', isActive ? '' : cat.slug)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
                  isActive
                    ? 'bg-[#3ea8c8] text-white border-[#3ea8c8]'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#3ea8c8] hover:text-[#3ea8c8]'
                }`}
              >
                {cat.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Sort */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Sort By</h3>
        <select
          value={activeSort}
          onChange={(e) => updateFilter('sort', e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg py-2 px-3 bg-gray-50 focus:bg-white focus:border-[#3ea8c8] focus:ring-1 focus:ring-[#3ea8c8]/30 outline-none transition-all"
        >
          <option value="az">Name (A-Z)</option>
          <option value="za">Name (Z-A)</option>
          <option value="recent">Most Recent</option>
        </select>
      </div>

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

export default CompanyFilters
