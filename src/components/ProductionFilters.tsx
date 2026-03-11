'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

interface FilterProps {
  types: Array<{ id: number; name: string; slug: string }>
  statuses: Array<{ id: number; name: string; slug: string }>
}

export function ProductionFilters({ types, statuses }: FilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete('page')
      router.push(`/productions?${params.toString()}`)
    },
    [router, searchParams]
  )

  return (
    <div className="white-bg p-4 space-y-6">
      <div>
        <h3 className="font-semibold text-primary mb-3 text-sm uppercase tracking-wide">Search</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const q = (e.currentTarget.elements.namedItem('s') as HTMLInputElement).value
            updateFilter('s', q)
          }}
        >
          <input
            name="s"
            defaultValue={searchParams.get('s') ?? ''}
            placeholder="Search productions..."
            className="form-input text-sm"
          />
        </form>
      </div>

      <div>
        <h3 className="font-semibold text-primary mb-3 text-sm uppercase tracking-wide">
          Production Type
        </h3>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="type"
              value=""
              checked={!searchParams.get('type')}
              onChange={() => updateFilter('type', '')}
              className="text-primary"
            />
            All Types
          </label>
          {types.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="type"
                value={t.slug}
                checked={searchParams.get('type') === t.slug}
                onChange={() => updateFilter('type', t.slug)}
                className="text-primary"
              />
              {t.name}
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-primary mb-3 text-sm uppercase tracking-wide">
          Status
        </h3>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="status"
              value=""
              checked={!searchParams.get('status')}
              onChange={() => updateFilter('status', '')}
              className="text-primary"
            />
            All Statuses
          </label>
          {statuses.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="status"
                value={s.slug}
                checked={searchParams.get('status') === s.slug}
                onChange={() => updateFilter('status', s.slug)}
                className="text-primary"
              />
              {s.name}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
