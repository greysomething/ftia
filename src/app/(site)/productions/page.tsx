import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { getProductions, getProductionWeeks, getLocationFilterOptions } from '@/lib/queries'
import { getUser, isMember } from '@/lib/auth'
import { formatProductionDate, formatLocations, PHASE_LABELS, PHASE_COLORS, formatDate, cn } from '@/lib/utils'
import { ProductionCard } from '@/components/ProductionCard'
import { ProductionFilters } from '@/components/ProductionFilters'
import { ViewToggle } from '@/components/ViewToggle'
import { TrendingSearches } from '@/components/TrendingSearches'
import { createClient } from '@/lib/supabase/server'
import type { ProductionPhase } from '@/types/database'

export const metadata: Metadata = {
  title: 'Productions | Film & Television Database',
  description: 'Browse active film and TV productions in pre-production. Access contacts, crew, and shoot details.',
}

interface Props {
  searchParams: Promise<{
    page?: string
    type?: string
    status?: string
    location?: string
    s?: string
    sort?: string
    view?: string
  }>
}

const PHASE_BADGE_STYLES: Record<ProductionPhase, string> = {
  'in-pre-production': 'bg-blue-50 text-blue-700',
  'in-production': 'bg-green-50 text-green-700',
  'in-post-production': 'bg-purple-50 text-purple-700',
  'completed': 'bg-gray-100 text-gray-600',
}

export default async function ProductionsPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)
  const view = params.view ?? 'browse'
  const user = await getUser()
  const member = user ? await isMember(user.id) : false

  // Fetch filter options (shared between views)
  const supabase = await createClient()
  const [{ data: types }, { data: statuses }, locationOptions] = await Promise.all([
    supabase.from('production_types').select('id,name,slug').order('name'),
    supabase.from('production_statuses').select('id,name,slug').order('name'),
    getLocationFilterOptions(),
  ])

  // Fetch data based on view
  const isWeekly = view === 'weekly'
  const isBrowse = view === 'browse' || view === 'cards'

  let productions: any[] = []
  let total = 0
  let currentPerPage = 20
  let weeks: { monday: string; count: number }[] = []

  if (isWeekly) {
    weeks = await getProductionWeeks()
  }

  if (isBrowse) {
    const result = await getProductions({
      page,
      search: params.s,
      typeSlug: params.type,
      statusSlug: params.status,
      locationFilter: params.location,
      sort: params.sort,
    })
    productions = result.productions
    total = result.total
    currentPerPage = result.perPage
  }

  const totalPages = Math.ceil(total / currentPerPage)

  // Stats for the header
  const weeklyAdditions = weeks.length > 0 ? weeks[0].count : 0
  const activeLocationCount = locationOptions.length

  return (
    <div>
      {/* ===== Premium Dark Header Banner ===== */}
      <div className="bg-gradient-to-br from-[#1a2332] via-[#1e2a3a] to-[#162029] text-white">
        <div className="page-wrap py-10 pb-8">
          {/* Top: Title + ViewToggle */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Productions</h1>
              <p className="text-white/60 text-sm mt-1.5 max-w-md">
                Your insider database of film &amp; TV projects in active development
              </p>
            </div>
            <Suspense fallback={null}>
              <ViewToggle />
            </Suspense>
          </div>

          {/* Stats Bar */}
          <div className="flex flex-wrap items-center gap-6 pt-4 border-t border-white/10">
            {isBrowse && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#3ea8c8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                  </svg>
                </div>
                <div>
                  <div className="text-lg font-bold">{total.toLocaleString()}</div>
                  <div className="text-xs text-white/50 uppercase tracking-wider">Productions</div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#3ea8c8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <div>
                <div className="text-lg font-bold">{weeklyAdditions}</div>
                <div className="text-xs text-white/50 uppercase tracking-wider">This Week</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#3ea8c8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <div className="text-lg font-bold">{activeLocationCount}</div>
                <div className="text-xs text-white/50 uppercase tracking-wider">Locations</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Main Content ===== */}
      <div className="page-wrap py-8">
        {/* Membership CTA */}
        {!member && (
          <div className="mb-6 p-4 bg-gradient-to-r from-[#3ea8c8]/10 to-[#3ea8c8]/5 border border-[#3ea8c8]/20 rounded-xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#3ea8c8]/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-[#3ea8c8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <p className="text-sm text-gray-700">
                <strong>Members</strong> get full access to contact details, crew info, and all listings.
              </p>
            </div>
            <a href="/membership-plans" className="flex-shrink-0 text-sm font-medium bg-[#3ea8c8] text-white px-4 py-2 rounded-lg hover:bg-[#2d8ba8] transition-colors">
              Join Now
            </a>
          </div>
        )}

        {isWeekly ? (
          /* ===== WEEKLY VIEW ===== */
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Main Weekly Content */}
            <div className="flex-1">
              {/* This Week Spotlight */}
              {weeks.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-[#3ea8c8] p-6 mb-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <span className="inline-block bg-[#3ea8c8] text-white text-xs font-bold px-2.5 py-0.5 rounded-full mb-2 uppercase tracking-wider">
                        This Week
                      </span>
                      <h2 className="text-xl font-bold text-[#1a2332]">
                        Current Production List
                      </h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Published {formatWeekDate(weeks[0].monday)}
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-[#1a2332]">{weeks[0].count}</div>
                        <div className="text-xs text-gray-400 uppercase tracking-wider">Projects</div>
                      </div>
                      <Link
                        href={`/productions/week/${weeks[0].monday}`}
                        className="inline-flex items-center gap-2 bg-[#1a2332] text-white font-medium text-sm px-5 py-2.5 rounded-lg hover:bg-[#243244] transition-colors"
                      >
                        View List
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {/* Archives */}
              <div className="mb-4">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Archive</h2>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {weeks.slice(1).map((week) => (
                    <div key={week.monday} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-[#1a2332]/5 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-[#1a2332]">{week.count}</span>
                        </div>
                        <div>
                          <div className="font-medium text-gray-800 text-sm">
                            Week of {formatWeekDate(week.monday)}
                          </div>
                          <div className="text-xs text-gray-400">
                            {week.count} production{week.count !== 1 ? 's' : ''} listed
                          </div>
                        </div>
                      </div>
                      <Link
                        href={`/productions/week/${week.monday}`}
                        className="text-sm font-medium text-[#3ea8c8] hover:text-[#2d8ba8] transition-colors opacity-70 group-hover:opacity-100 inline-flex items-center gap-1"
                      >
                        View
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <aside className="lg:w-72 flex-shrink-0 space-y-4">
              {/* Quick Stats */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Quick Stats</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Total Weeks</span>
                    <span className="text-sm font-bold text-[#1a2332]">{weeks.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Total Productions</span>
                    <span className="text-sm font-bold text-[#1a2332]">
                      {weeks.reduce((sum, w) => sum + w.count, 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Trending Searches */}
              <Suspense fallback={
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Trending</h3>
                  <div className="animate-pulse space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-4 bg-gray-100 rounded w-3/4" />
                    ))}
                  </div>
                </div>
              }>
                <TrendingSearches />
              </Suspense>

              {/* Membership CTA */}
              {!member && (
                <div className="bg-gradient-to-br from-[#1a2332] to-[#243244] rounded-xl p-5 text-white">
                  <h3 className="font-bold text-sm mb-2">Unlock Full Access</h3>
                  <p className="text-white/70 text-xs mb-4 leading-relaxed">
                    Get contact details, crew lists, and weekly email alerts for new productions.
                  </p>
                  <a
                    href="/membership-plans"
                    className="block text-center text-sm font-medium bg-[#3ea8c8] text-white px-4 py-2 rounded-lg hover:bg-[#2d8ba8] transition-colors"
                  >
                    View Plans
                  </a>
                </div>
              )}
            </aside>
          </div>
        ) : (
          /* ===== BROWSE / CARDS VIEW ===== */
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar Filters */}
            <aside className="lg:w-72 flex-shrink-0">
              <ProductionFilters
                types={types ?? []}
                statuses={statuses ?? []}
                locations={locationOptions}
                resultCount={total}
              />
            </aside>

            {/* Main Content */}
            <div className="flex-1 min-w-0">
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="text-sm text-gray-500">
                  Showing <span className="font-semibold text-[#1a2332]">{productions.length}</span> of{' '}
                  <span className="font-semibold text-[#1a2332]">{total.toLocaleString()}</span> productions
                  {params.s && (
                    <span className="ml-1">
                      for &ldquo;<span className="text-[#3ea8c8]">{params.s}</span>&rdquo;
                    </span>
                  )}
                </div>
              </div>

              {productions.length === 0 ? (
                /* Empty State */
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <p className="text-gray-600 font-medium text-lg">No productions found</p>
                  <p className="text-gray-400 text-sm mt-1">Try adjusting your filters or search terms.</p>
                </div>
              ) : view === 'cards' ? (
                /* Cards Grid View */
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                  {productions.map((p: any) => (
                    <ProductionCard key={p.id} production={p} isMember={member} />
                  ))}
                </div>
              ) : (
                /* Table View */
                <>
                  {/* Desktop Table */}
                  <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50/80 border-b border-gray-100">
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Title</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Location</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Shoot Date</th>
                          <th className="px-5 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {productions.map((p: any) => {
                          const primaryType =
                            p.production_type_links?.find((l: any) => l.is_primary)?.production_types
                            ?? p.production_type_links?.[0]?.production_types
                          const primaryStatus =
                            p.production_status_links?.find((l: any) => l.is_primary)?.production_statuses
                            ?? p.production_status_links?.[0]?.production_statuses
                          const location = p.production_locations?.length
                            ? formatLocations(p.production_locations)
                            : null
                          const phase: ProductionPhase = p.computed_status
                          return (
                            <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-5 py-3.5">
                                <Link
                                  href={`/production/${p.slug}`}
                                  className="font-medium text-[#1a2332] hover:text-[#3ea8c8] transition-colors"
                                >
                                  {p.title}
                                </Link>
                              </td>
                              <td className="px-5 py-3.5 text-sm text-gray-500">
                                {primaryType ? (
                                  <Link href={`/production-type/${primaryType.slug}`} className="hover:text-[#3ea8c8] transition-colors">
                                    {primaryType.name}
                                  </Link>
                                ) : (
                                  <span className="text-gray-300">&mdash;</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${PHASE_BADGE_STYLES[phase]}`}>
                                  {primaryStatus ? primaryStatus.name : PHASE_LABELS[phase]}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-sm text-gray-500 max-w-[180px] truncate" title={location ?? undefined}>
                                {location ? (
                                  <span className="inline-flex items-center gap-1">
                                    <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    </svg>
                                    {location}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">&mdash;</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-sm text-gray-500 whitespace-nowrap">
                                {formatProductionDate(p.production_date_start)}
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                <Link
                                  href={`/production/${p.slug}`}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-[#3ea8c8] hover:text-[#2d8ba8] transition-colors"
                                >
                                  View
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </Link>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View (always cards on mobile) */}
                  <div className="lg:hidden grid grid-cols-1 gap-3 mb-6">
                    {productions.map((p: any) => (
                      <ProductionCard key={p.id} production={p} isMember={member} />
                    ))}
                  </div>
                </>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <nav className="flex items-center justify-center gap-1" aria-label="Pagination">
                  <PaginationLink
                    page={page - 1}
                    params={params}
                    disabled={page <= 1}
                    aria-label="Previous page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </PaginationLink>

                  {getPaginationRange(page, totalPages).map((p, i) =>
                    p === '...' ? (
                      <span key={`ellipsis-${i}`} className="px-2 py-2 text-sm text-gray-400">
                        ...
                      </span>
                    ) : (
                      <PaginationLink
                        key={p}
                        page={p as number}
                        params={params}
                        active={page === p}
                      >
                        {p}
                      </PaginationLink>
                    )
                  )}

                  <PaginationLink
                    page={page + 1}
                    params={params}
                    disabled={page >= totalPages}
                    aria-label="Next page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </PaginationLink>
                </nav>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ===== Helper Components ===== */

function PaginationLink({
  page,
  params,
  active,
  disabled,
  children,
  ...rest
}: {
  page: number
  params: Record<string, string | undefined>
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
  'aria-label'?: string
}) {
  const sp = new URLSearchParams()
  if (page > 1) sp.set('page', String(page))
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== 'page') sp.set(k, v)
  }
  const href = `/productions?${sp.toString()}`

  if (disabled) {
    return (
      <span
        className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm text-gray-300 cursor-not-allowed"
        {...rest}
      >
        {children}
      </span>
    )
  }

  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm font-medium transition-colors',
        active
          ? 'bg-[#1a2332] text-white'
          : 'text-gray-600 hover:bg-gray-100'
      )}
      {...rest}
    >
      {children}
    </Link>
  )
}

function getPaginationRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | '...')[] = [1]

  if (current > 3) pages.push('...')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (current < total - 2) pages.push('...')
  pages.push(total)

  return pages
}

function formatWeekDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
