import Link from 'next/link'
import { formatProductionDate, PHASE_LABELS, PHASE_COLORS } from '@/lib/utils'
import type { ProductionPhase } from '@/types/database'

interface ProductionCardProps {
  production: {
    id: number
    title: string
    slug: string
    computed_status: ProductionPhase
    production_date_start: string | null
    wp_updated_at: string | null
    production_type_links?: Array<{
      is_primary: boolean
      production_types: { name: string; slug: string }
    }>
    production_locations?: Array<{ location: string }>
  }
  isMember?: boolean
}

export function ProductionCard({ production, isMember }: ProductionCardProps) {
  const primaryType = production.production_type_links?.find((l) => l.is_primary)?.production_types
    ?? production.production_type_links?.[0]?.production_types

  const location = production.production_locations?.[0]?.location

  return (
    <article className="white-bg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Link
            href={`/production/${production.slug}`}
            className="block font-semibold text-primary hover:text-primary-light text-base leading-snug"
          >
            {production.title}
          </Link>
          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-gray-500">
            {primaryType && (
              <Link
                href={`/production-type/${primaryType.slug}`}
                className="text-gray-600 hover:text-primary"
              >
                {primaryType.name}
              </Link>
            )}
            {primaryType && (production.computed_status || location) && (
              <span className="text-gray-300">•</span>
            )}
            <span className={`production-status-badge ${PHASE_COLORS[production.computed_status]}`}>
              {PHASE_LABELS[production.computed_status]}
            </span>
          </div>
          {location && (
            <p className="text-xs text-gray-400 mt-1">📍 {location}</p>
          )}
          {production.production_date_start && (
            <p className="text-xs text-gray-400 mt-0.5">
              Shoot Date: {formatProductionDate(production.production_date_start)}
            </p>
          )}
        </div>
        <div className="flex-shrink-0">
          <Link
            href={`/production/${production.slug}`}
            className="text-xs text-primary border border-primary rounded px-2 py-1 hover:bg-primary hover:text-white transition-colors"
          >
            View →
          </Link>
        </div>
      </div>
    </article>
  )
}
