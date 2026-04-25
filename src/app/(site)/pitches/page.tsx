import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { getUser } from '@/lib/auth'
import { gatePublicPitchRoute } from '@/lib/pitch-marketplace-gate'
import { getPitches, getPitchGenres, getFeaturedPitches } from '@/lib/pitch-queries'
import { PitchCard } from '@/components/PitchCard'
import { PitchFilters } from '@/components/PitchFilters'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Pitch Marketplace | Production List',
  description:
    'Discover film and television projects seeking producers, investors, and industry partners. Browse pitches from writers and creators across all genres.',
}

interface Props {
  searchParams: Promise<{
    page?: string
    s?: string
    genre?: string
    format?: string
    budget?: string
    stage?: string
    sort?: string
  }>
}

export default async function PitchesPage({ searchParams }: Props) {
  // Hidden from non-admins until the marketplace flag is on. Admins
  // see the page so they can preview / curate pre-launch.
  const gateState = await gatePublicPitchRoute()

  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)
  const currentSort = params.sort ?? 'newest'
  const user = await getUser()

  const hasFilters = !!(params.s || params.genre || params.format || params.budget || params.stage)

  // Fetch data
  const [{ pitches, total, perPage }, genres, featuredPitches] = await Promise.all([
    getPitches({
      page,
      search: params.s,
      genre: params.genre,
      format: params.format,
      budget: params.budget,
      stage: params.stage,
      sort: currentSort,
    }),
    getPitchGenres(),
    hasFilters ? Promise.resolve([]) : getFeaturedPitches(6),
  ])

  const totalPages = Math.ceil(total / perPage)

  // Build current params for sort links (preserving filters)
  const currentParams: Record<string, string> = {}
  if (params.s) currentParams.s = params.s
  if (params.genre) currentParams.genre = params.genre
  if (params.format) currentParams.format = params.format
  if (params.budget) currentParams.budget = params.budget
  if (params.stage) currentParams.stage = params.stage

  return (
    <div>
      {/* Admin-only banner shown when the marketplace flag is OFF — admins
          can still navigate here to preview / seed content, but regular
          visitors get a 404 above. */}
      {gateState.isAdmin && !gateState.enabled && (
        <div className="bg-amber-100 border-b border-amber-300 text-amber-900 text-sm py-2.5 px-4 text-center">
          <strong>Pitch Marketplace is OFF for visitors.</strong>{' '}
          Only admins see this page.{' '}
          <Link href="/admin/site-settings" className="underline font-medium hover:text-amber-700">
            Open settings to enable
          </Link>
        </div>
      )}

      {/* ===== Hero Section ===== */}
      <div className="bg-gradient-to-r from-primary to-primary/80 text-white py-10">
        <div className="page-wrap">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Pitch Marketplace</h1>
              <p className="text-white/70 text-sm mt-1.5 max-w-lg">
                Discover your next project. Browse pitches from writers and creators seeking
                producers and partners.
              </p>
            </div>
            <Link
              href="/membership-account/my-pitches/new"
              className="inline-flex items-center gap-2 bg-white text-primary font-medium text-sm px-5 py-2.5 rounded-lg hover:bg-white/90 transition-colors whitespace-nowrap self-start"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              Submit Your Pitch
            </Link>
          </div>
        </div>
      </div>

      {/* ===== Main Content ===== */}
      <div className="page-wrap py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left Sidebar — Filters */}
          <aside className="hidden lg:block lg:w-64 flex-shrink-0">
            <Suspense fallback={null}>
              <PitchFilters genres={genres} />
            </Suspense>
          </aside>

          {/* Main Column */}
          <div className="flex-1 min-w-0">
            {/* Top bar: count + sort */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-gray-900">{total.toLocaleString()}</span>{' '}
                {total === 1 ? 'pitch' : 'pitches'} found
              </p>

              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Sort:</span>
                {(
                  [
                    ['newest', 'Newest'],
                    ['most-viewed', 'Most Viewed'],
                    ['title-asc', 'Title A-Z'],
                    ['title-desc', 'Title Z-A'],
                  ] as const
                ).map(([val, label]) => (
                  <Link
                    key={val}
                    href={`/pitches?${new URLSearchParams({ ...currentParams, sort: val, page: '1' }).toString()}`}
                    className={
                      currentSort === val
                        ? 'text-primary font-medium'
                        : 'text-gray-500 hover:text-primary'
                    }
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Featured Pitches */}
            {featuredPitches.length > 0 && (
              <div className="mb-8">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Featured
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {featuredPitches.map((pitch: any) => (
                    <PitchCard key={pitch.id} pitch={pitch} />
                  ))}
                </div>
              </div>
            )}

            {/* Pitch Grid */}
            {pitches.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pitches.map((pitch: any) => (
                  <PitchCard key={pitch.id} pitch={pitch} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-6 h-6 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <p className="text-gray-600 font-medium">No pitches match your filters.</p>
                <p className="text-sm text-gray-400 mt-1">
                  Try adjusting your search criteria.
                </p>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <nav className="flex items-center justify-center gap-1 mt-8" aria-label="Pagination">
                <PaginationLink
                  page={page - 1}
                  params={params}
                  disabled={page <= 1}
                  aria-label="Previous page"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
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
                  ),
                )}

                <PaginationLink
                  page={page + 1}
                  params={params}
                  disabled={page >= totalPages}
                  aria-label="Next page"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
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
  const href = `/pitches?${sp.toString()}`

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
        active ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100',
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
