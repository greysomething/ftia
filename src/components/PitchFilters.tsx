'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useTransition, useState } from 'react'
import type { TaxonomyTerm, PitchFormat, PitchBudgetRange, PitchDevelopmentStage } from '@/types/database'
import { PITCH_FORMAT_LABELS, BUDGET_RANGE_LABELS, DEVELOPMENT_STAGE_LABELS } from '@/lib/utils'

interface Props {
  genres: TaxonomyTerm[]
}

export function PitchFilters({ genres }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [searchValue, setSearchValue] = useState(searchParams.get('s') ?? '')

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    search: true, genre: true, format: true, budget: true, stage: true,
  })
  const toggleSection = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))

  const activeGenre = searchParams.get('genre') ?? ''
  const activeFormat = searchParams.get('format') ?? ''
  const activeBudget = searchParams.get('budget') ?? ''
  const activeStage = searchParams.get('stage') ?? ''

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (params.get(key) === value) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
      params.delete('page')
      startTransition(() => {
        router.push(`/pitches?${params.toString()}`)
      })
    },
    [router, searchParams]
  )

  const clearAll = useCallback(() => {
    setSearchValue('')
    startTransition(() => {
      router.push('/pitches')
    })
  }, [router])

  const hasFilters = activeGenre || activeFormat || activeBudget || activeStage || searchParams.get('s')

  const formatEntries = Object.entries(PITCH_FORMAT_LABELS) as [PitchFormat, string][]
  const budgetEntries = Object.entries(BUDGET_RANGE_LABELS) as [PitchBudgetRange, string][]
  const stageEntries = Object.entries(DEVELOPMENT_STAGE_LABELS) as [PitchDevelopmentStage, string][]

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={() => toggleSection('search')}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
        >
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Search</h3>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${openSections.search ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {openSections.search && (
          <div className="px-4 pb-4 -mt-1">
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
                  placeholder="Search pitches..."
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
        )}
      </div>

      {/* Genre */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={() => toggleSection('genre')}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
        >
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Genre</h3>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${openSections.genre ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {openSections.genre && (
          <div className="px-4 pb-4 -mt-1 space-y-1 max-h-60 overflow-y-auto">
            {genres.map((genre) => (
              <label
                key={genre.id}
                className="flex items-center gap-2 py-1 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={activeGenre === genre.slug}
                  onChange={() => updateFilter('genre', genre.slug)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-[#3ea8c8] focus:ring-[#3ea8c8]/30"
                />
                <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                  {genre.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Format */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={() => toggleSection('format')}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
        >
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Format</h3>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${openSections.format ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {openSections.format && (
          <div className="px-4 pb-4 -mt-1 space-y-1">
            {formatEntries.map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-2 py-1 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={activeFormat === value}
                  onChange={() => updateFilter('format', value)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-[#3ea8c8] focus:ring-[#3ea8c8]/30"
                />
                <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                  {label}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Budget Range */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={() => toggleSection('budget')}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
        >
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Budget Range</h3>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${openSections.budget ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {openSections.budget && (
          <div className="px-4 pb-4 -mt-1 space-y-1">
            {budgetEntries.map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-2 py-1 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={activeBudget === value}
                  onChange={() => updateFilter('budget', value)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-[#3ea8c8] focus:ring-[#3ea8c8]/30"
                />
                <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                  {label}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Development Stage */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={() => toggleSection('stage')}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
        >
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Development Stage</h3>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${openSections.stage ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {openSections.stage && (
          <div className="px-4 pb-4 -mt-1 space-y-1">
            {stageEntries.map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-2 py-1 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={activeStage === value}
                  onChange={() => updateFilter('stage', value)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-[#3ea8c8] focus:ring-[#3ea8c8]/30"
                />
                <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                  {label}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Clear All Filters */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="w-full text-sm text-red-500 hover:text-red-700 font-medium py-2 transition-colors"
        >
          Clear All Filters
        </button>
      )}

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

export default PitchFilters
