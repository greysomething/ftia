import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUser, isMember } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { CrewFilters } from '@/components/CrewFilters'

export const metadata: Metadata = {
  title: 'Cast & Crew Directory | Film & TV Industry Professionals',
  description: 'Browse producers, directors, writers, casting executives and crew members in the film and television industry.',
}

interface Props {
  searchParams: Promise<{ page?: string; s?: string; role?: string; sort?: string }>
}

const PER_PAGE = 30

export default async function CrewArchive({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)
  const from = (page - 1) * PER_PAGE

  const user = await getUser()
  const member = user ? await isMember(user.id) : false

  const supabase = await createClient()

  // Build sort order
  let orderCol = 'name'
  let orderAsc = true
  if (params.sort === 'za') {
    orderCol = 'name'
    orderAsc = false
  }

  // Fetch categories in parallel always
  const categoriesPromise = supabase.from('role_categories').select('id,name,slug').order('name')

  let filteredCrew: any[] = []
  let totalCount = 0

  if (params.role) {
    // When filtering by role: query through crew_category_links to get matching crew IDs first
    const { data: catData } = await supabase
      .from('role_categories')
      .select('id')
      .eq('slug', params.role)
      .single()

    if (catData) {
      // Get crew IDs in this category
      let linkQuery = supabase
        .from('crew_category_links')
        .select('crew_id')
        .eq('category_id', catData.id)

      const { data: links } = await linkQuery
      const crewIds = links?.map((l: any) => l.crew_id) ?? []

      if (crewIds.length > 0) {
        // Now fetch those crew members with pagination
        let crewQuery = supabase
          .from('crew_members')
          .select(
            'id,name,slug,linkedin,crew_category_links(role_categories(id,name,slug))',
            { count: 'exact' }
          )
          .eq('visibility', 'publish')
          .in('id', crewIds)
          .order(orderCol, { ascending: orderAsc })
          .range(from, from + PER_PAGE - 1)

        if (params.s) {
          crewQuery = crewQuery.ilike('name', `%${params.s}%`)
        }

        const { data: crew, count } = await crewQuery
        filteredCrew = crew ?? []
        totalCount = count ?? 0
      }
    }
  } else {
    // No role filter: standard query
    let query = supabase
      .from('crew_members')
      .select(
        'id,name,slug,linkedin,crew_category_links(role_categories(id,name,slug))',
        { count: 'exact' }
      )
      .eq('visibility', 'publish')
      .order(orderCol, { ascending: orderAsc })
      .range(from, from + PER_PAGE - 1)

    if (params.s) {
      query = query.ilike('name', `%${params.s}%`)
    }

    const { data: crew, count } = await query
    filteredCrew = crew ?? []
    totalCount = count ?? 0
  }

  const { data: categories } = await categoriesPromise
  const totalPages = Math.ceil(totalCount / PER_PAGE)
  const categoryCount = categories?.length ?? 0

  return (
    <div>
      {/* ===== Premium Dark Header Banner ===== */}
      <div className="bg-gradient-to-br from-[#1a2332] via-[#1e2a3a] to-[#162029] text-white">
        <div className="page-wrap py-10 pb-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">Cast &amp; Crew Directory</h1>
            <p className="text-white/60 text-sm mt-1.5 max-w-md">
              Industry professionals &mdash; producers, directors, writers &amp; crew
            </p>
          </div>

          {/* Stats Bar */}
          <div className="flex flex-wrap items-center gap-6 pt-4 border-t border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#3ea8c8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <div className="text-lg font-bold">{totalCount.toLocaleString()}</div>
                <div className="text-xs text-white/50 uppercase tracking-wider">Professionals</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#3ea8c8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <div>
                <div className="text-lg font-bold">{categoryCount}</div>
                <div className="text-xs text-white/50 uppercase tracking-wider">Role Categories</div>
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
                <strong>Members</strong> get full access to crew profiles, contact details, and all listings.
              </p>
            </div>
            <a href="/membership-plans" className="flex-shrink-0 text-sm font-medium bg-[#3ea8c8] text-white px-4 py-2 rounded-lg hover:bg-[#2d8ba8] transition-colors">
              Join Now
            </a>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Filters */}
          <aside className="lg:w-72 flex-shrink-0">
            <CrewFilters
              categories={categories ?? []}
              resultCount={totalCount}
            />
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="text-sm text-gray-500">
                Showing <span className="font-semibold text-[#1a2332]">{filteredCrew.length}</span> of{' '}
                <span className="font-semibold text-[#1a2332]">{totalCount.toLocaleString()}</span> professionals
                {params.s && (
                  <span className="ml-1">
                    for &ldquo;<span className="text-[#3ea8c8]">{params.s}</span>&rdquo;
                  </span>
                )}
              </div>
            </div>

            {filteredCrew.length === 0 ? (
              /* Empty State */
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-16 text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <p className="text-gray-600 font-medium text-lg">No crew members found</p>
                <p className="text-gray-400 text-sm mt-1">Try adjusting your filters or search terms.</p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-100">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Role(s)</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">LinkedIn</th>
                        <th className="px-5 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredCrew.map((person: any) => {
                        const roles = person.crew_category_links?.map(
                          (link: any) => link.role_categories
                        ).filter(Boolean) ?? []
                        return (
                          <tr key={person.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-5 py-3.5">
                              <Link
                                href={`/production-role/${person.slug}`}
                                className="font-medium text-[#1a2332] hover:text-[#3ea8c8] transition-colors"
                              >
                                {person.name}
                              </Link>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex flex-wrap gap-1.5">
                                {roles.slice(0, 3).map((role: any) => (
                                  <span
                                    key={role.id}
                                    className="inline-block text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full"
                                  >
                                    {role.name}
                                  </span>
                                ))}
                                {roles.length === 0 && (
                                  <span className="text-gray-300">&mdash;</span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              {person.linkedin ? (
                                <a
                                  href={person.linkedin}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center text-[#0077b5] hover:text-[#005582] transition-colors"
                                  aria-label={`${person.name} LinkedIn`}
                                >
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                                  </svg>
                                </a>
                              ) : (
                                <span className="text-gray-300">&mdash;</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <Link
                                href={`/production-role/${person.slug}`}
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

                {/* Mobile Card View */}
                <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                  {filteredCrew.map((person: any) => {
                    const roles = person.crew_category_links?.map(
                      (link: any) => link.role_categories
                    ).filter(Boolean) ?? []
                    return (
                      <div
                        key={person.id}
                        className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <Link
                            href={`/production-role/${person.slug}`}
                            className="font-semibold text-[#1a2332] hover:text-[#3ea8c8] transition-colors block"
                          >
                            {person.name}
                          </Link>
                          {person.linkedin && (
                            <a
                              href={person.linkedin}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#0077b5] hover:text-[#005582] transition-colors flex-shrink-0 ml-2"
                              aria-label={`${person.name} LinkedIn`}
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                              </svg>
                            </a>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {roles.slice(0, 3).map((role: any) => (
                            <span
                              key={role.id}
                              className="inline-block text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                            >
                              {role.name}
                            </span>
                          ))}
                        </div>
                        <Link
                          href={`/production-role/${person.slug}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#3ea8c8] hover:text-[#2d8ba8] transition-colors"
                        >
                          View Profile
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>
                    )
                  })}
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
  const href = `/production-role?${sp.toString()}`

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
