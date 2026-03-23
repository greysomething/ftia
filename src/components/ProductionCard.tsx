import Link from 'next/link'
import { formatProductionDate, formatLocations, PHASE_LABELS } from '@/lib/utils'
import type { ProductionPhase } from '@/types/database'

const PHASE_BORDER_COLORS: Record<ProductionPhase, string> = {
  'in-pre-production': 'border-l-blue-500',
  'in-production': 'border-l-green-500',
  'in-post-production': 'border-l-purple-500',
  'completed': 'border-l-gray-400',
}

const PHASE_BADGE_STYLES: Record<ProductionPhase, string> = {
  'in-pre-production': 'bg-blue-50 text-blue-700',
  'in-production': 'bg-green-50 text-green-700',
  'in-post-production': 'bg-purple-50 text-purple-700',
  'completed': 'bg-gray-100 text-gray-600',
}

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
    production_status_links?: Array<{
      is_primary: boolean
      production_statuses: { name: string; slug: string }
    }>
    production_locations?: Array<{
      location: string
      city?: string | null
      stage?: string | null
      country?: string | null
    }>
  }
  isMember?: boolean
}

export function ProductionCard({ production }: ProductionCardProps) {
  const primaryType = production.production_type_links?.find((l) => l.is_primary)?.production_types
    ?? production.production_type_links?.[0]?.production_types

  const primaryStatus = production.production_status_links?.find((l) => l.is_primary)?.production_statuses
    ?? production.production_status_links?.[0]?.production_statuses

  const location = production.production_locations?.length
    ? formatLocations(production.production_locations)
    : undefined

  const phase: ProductionPhase = production.computed_status

  return (
    <article className={`bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border border-gray-100 border-l-4 ${PHASE_BORDER_COLORS[phase]} overflow-hidden group`}>
      <div className="p-5">
        {/* Header: Title + Type Badge */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <Link
            href={`/production/${production.slug}`}
            className="block font-semibold text-[#1a2332] hover:text-[#3ea8c8] text-base leading-snug transition-colors"
          >
            {production.title}
          </Link>
          {primaryType && (
            <Link
              href={`/production-type/${primaryType.slug}`}
              className="flex-shrink-0 text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded hover:bg-gray-200 transition-colors"
            >
              {primaryType.name}
            </Link>
          )}
        </div>

        {/* Status Badge */}
        <div className="mb-3">
          <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${PHASE_BADGE_STYLES[phase]}`}>
            {primaryStatus ? primaryStatus.name : PHASE_LABELS[phase]}
          </span>
        </div>

        {/* Meta Info */}
        <div className="space-y-1.5 text-sm text-gray-500">
          {location && (
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">{location}</span>
            </div>
          )}
          {production.production_date_start && (
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{formatProductionDate(production.production_date_start)}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-gray-100">
          <Link
            href={`/production/${production.slug}`}
            className="text-sm font-medium text-[#3ea8c8] hover:text-[#2d8ba8] transition-colors group-hover:translate-x-0.5 inline-flex items-center gap-1"
          >
            View Details
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </article>
  )
}

export default ProductionCard
