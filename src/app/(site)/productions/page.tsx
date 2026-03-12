import type { Metadata } from 'next'
import Link from 'next/link'
import { getProductions } from '@/lib/queries'
import { getUser, isMember } from '@/lib/auth'
import { formatProductionDate, PHASE_LABELS, PHASE_COLORS } from '@/lib/utils'
import { ProductionCard } from '@/components/ProductionCard'
import { Pagination } from '@/components/Pagination'
import { ProductionFilters } from '@/components/ProductionFilters'
import { createClient } from '@/lib/supabase/server'
import type { ProductionPhase } from '@/types/database'

export const metadata: Metadata = {
  title: 'Productions | Film & Television Database',
  description: 'Browse active film and TV productions in pre-production. Access contacts, crew, and shoot details.',
}

interface Props {
  searchParams: Promise<{ page?: string; type?: string; status?: string; s?: string }>
}

const STATUS_LEGEND: { phase: ProductionPhase; color: string }[] = [
  { phase: 'in-pre-production',  color: 'bg-blue-100 text-blue-800' },
  { phase: 'in-production',      color: 'bg-green-100 text-green-800' },
  { phase: 'in-post-production', color: 'bg-purple-100 text-purple-800' },
  { phase: 'completed',          color: 'bg-gray-100 text-gray-600' },
]

export default async function ProductionsPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)
  const user = await getUser()
  const member = user ? await isMember(user.id) : false

  const { productions, total, perPage } = await getProductions({
    page,
    search: params.s,
  })

  // Fetch filter options
  const supabase = await createClient()
  const [{ data: types }, { data: statuses }] = await Promise.all([
    supabase.from('production_types').select('id,name,slug').order('name'),
    supabase.from('production_statuses').select('id,name,slug').order('name'),
  ])

  return (
    <div className="page-wrap py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <aside className="lg:w-64 flex-shrink-0">
          <ProductionFilters types={types ?? []} statuses={statuses ?? []} />
        </aside>

        {/* Main content */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-primary">Productions</h1>
              <p className="text-sm text-gray-500 mt-1">
                {total.toLocaleString()} productions in the database
              </p>
            </div>
          </div>

          {/* Status colour legend */}
          <div className="flex flex-wrap gap-2 mb-5">
            {STATUS_LEGEND.map(({ phase, color }) => (
              <span key={phase} className={`production-status-badge ${color}`}>
                {PHASE_LABELS[phase]}
              </span>
            ))}
          </div>

          {!member && (
            <div className="mb-5 p-4 bg-accent/10 border border-accent/30 rounded-lg flex items-center justify-between gap-4">
              <p className="text-sm text-gray-700">
                <strong>Members</strong> get full access to contact details, crew info, and all listings.
              </p>
              <a href="/membership-account/membership-levels" className="btn-accent text-sm py-1.5 px-3 flex-shrink-0">
                Join Now
              </a>
            </div>
          )}

          {productions.length === 0 ? (
            <div className="white-bg p-12 text-center text-gray-500">
              No productions found. Try adjusting your filters.
            </div>
          ) : (
            <>
              {/* Desktop table view */}
              <div className="hidden lg:block white-bg overflow-hidden mb-4">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Location</th>
                      <th>Shoot Date</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {productions.map((p: any) => {
                      const primaryType =
                        p.production_type_links?.find((l: any) => l.is_primary)?.production_types
                        ?? p.production_type_links?.[0]?.production_types
                      const location = p.production_locations?.[0]?.location
                      const phase: ProductionPhase = p.computed_status
                      return (
                        <tr key={p.id}>
                          <td>
                            <Link
                              href={`/production/${p.slug}`}
                              className="font-medium text-primary hover:text-primary-light"
                            >
                              {p.title}
                            </Link>
                          </td>
                          <td className="text-gray-500 text-sm">
                            {primaryType ? (
                              <Link href={`/production-type/${primaryType.slug}`} className="hover:text-primary">
                                {primaryType.name}
                              </Link>
                            ) : '—'}
                          </td>
                          <td>
                            <span className={`production-status-badge ${PHASE_COLORS[phase]}`}>
                              {PHASE_LABELS[phase]}
                            </span>
                          </td>
                          <td className="text-gray-500 text-sm">{location ?? '—'}</td>
                          <td className="text-gray-500 text-sm">
                            {formatProductionDate(p.production_date_start)}
                          </td>
                          <td>
                            <Link
                              href={`/production/${p.slug}`}
                              className="text-xs text-primary border border-primary rounded px-2 py-1 hover:bg-primary hover:text-white transition-colors whitespace-nowrap"
                            >
                              View →
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile card view */}
              <div className="lg:hidden space-y-3">
                {productions.map((p: any) => (
                  <ProductionCard key={p.id} production={p} isMember={member} />
                ))}
              </div>
            </>
          )}

          <Pagination current={page} total={total} perPage={perPage} basePath="/productions" />
        </div>
      </div>
    </div>
  )
}
