import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { getUser, isMember } from '@/lib/auth'
import { getDnwNotices } from '@/lib/queries'
import { formatDate } from '@/lib/utils'
import { MemberGate } from '@/components/MemberGate'
import { Pagination } from '@/components/Pagination'
import { TrendingSearches } from '@/components/TrendingSearches'

export const metadata: Metadata = {
  title: 'Do Not Work Notices | Production List',
  description: 'Current SAG-AFTRA style Do Not Work notices for film and television productions.',
}

interface Props {
  searchParams: Promise<{ page?: string }>
}

export default async function DoNotWorkPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)

  const user = await getUser()
  const member = user ? await isMember(user.id) : false

  if (!member) {
    return (
      <div className="page-wrap py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Do Not Work Notices</h1>
        <p className="text-gray-600 mb-6">
          Stay informed about productions that have not signed industry-standard contracts.
        </p>
        <MemberGate message="Do Not Work notices are available exclusively to FTIA members. Join now to stay informed about productions without proper contracts." />
      </div>
    )
  }

  const { notices, total, perPage } = await getDnwNotices({ page })

  return (
    <div className="page-wrap py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Do Not Work Notices</h1>
        <p className="text-gray-600">
          The following productions have been flagged because they have not signed
          SAG-AFTRA or other industry-standard contracts. Members are advised not to
          accept employment on these productions until the issues are resolved.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Warning banner */}
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-md mb-8">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <h3 className="text-sm font-semibold text-red-800">Important Notice</h3>
                <p className="text-sm text-red-700 mt-1">
                  These notices are provided for informational purposes. Always verify the current
                  status of any production before making employment decisions. Notices may be
                  resolved at any time.
                </p>
              </div>
            </div>
          </div>

          {notices.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-lg font-medium">No active notices</p>
              <p className="text-sm mt-1">There are currently no active Do Not Work notices.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {notices.map((notice: any) => (
                <div key={notice.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-gray-900">
                        {notice.production_title}
                      </h2>
                      <p className="text-sm text-gray-600 mt-1">
                        <span className="font-medium">Company:</span> {notice.company_name}
                      </p>
                      {notice.reason && (
                        <p className="text-sm text-gray-700 mt-2">
                          <span className="font-medium">Reason:</span> {notice.reason}
                        </p>
                      )}
                      {notice.details && (
                        <p className="text-sm text-gray-600 mt-2">{notice.details}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="badge badge-red">Active</span>
                      <span className="text-xs text-gray-400">{formatDate(notice.notice_date)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {total > perPage && (
            <div className="mt-8">
              <Pagination
                current={page}
                total={total}
                perPage={perPage}
                basePath="/do-not-work"
              />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="lg:w-72 flex-shrink-0 space-y-5">
          {/* Trending Productions */}
          <Suspense fallback={
            <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-4" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <div className="w-5 h-5 rounded-full bg-gray-100" />
                  <div className="h-3 bg-gray-100 rounded flex-1" />
                </div>
              ))}
            </div>
          }>
            <TrendingSearches variant="sidebar" limit={8} />
          </Suspense>

          {/* Membership CTA */}
          <div className="bg-primary rounded-xl p-5 text-center">
            <div className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="font-bold text-white text-sm mb-1">Get Full Access</h3>
            <p className="text-white/60 text-xs leading-relaxed mb-4">
              1,500+ active productions with contacts, crew details, and weekly updated project lists.
            </p>
            <Link
              href="/membership-plans"
              className="block bg-accent hover:bg-accent-dark text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              View Membership Plans
            </Link>
            <p className="text-white/30 text-[10px] mt-2">Starting at $38.85/month</p>
          </div>

          {/* Browse by Topic */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-bold text-primary text-sm mb-3">Browse by Topic</h3>
            <div className="space-y-0.5">
              {[
                { href: '/blog?category=project-alerts', label: 'Project Alerts', dot: 'bg-red-400' },
                { href: '/blog?category=industry-news', label: 'Industry News', dot: 'bg-blue-400' },
                { href: '/blog?category=casting-calls', label: 'Casting Calls', dot: 'bg-amber-400' },
                { href: '/blog?category=film-jobs', label: 'Film Jobs', dot: 'bg-green-400' },
                { href: '/blog?category=how-to', label: 'How To', dot: 'bg-purple-400' },
                { href: '/blog?category=production-list', label: 'Production List', dot: 'bg-cyan-400' },
              ].map(cat => (
                <Link
                  key={cat.href}
                  href={cat.href}
                  className="flex items-center gap-2.5 text-sm py-2 px-2 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full ${cat.dot}`} />
                  {cat.label}
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
