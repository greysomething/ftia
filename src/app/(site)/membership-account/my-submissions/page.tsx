import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAuth, getUserProfile } from '@/lib/auth'
import { getFeatureFlags } from '@/lib/feature-flags'
import { getMySubmissions, getMySubmissionCounts } from '@/lib/submission-queries'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'My Submissions | Production List',
}

interface Props {
  searchParams: Promise<{ page?: string; tab?: string; submitted?: string }>
}

const STATUS_BADGES: Record<string, { label: string; classes: string }> = {
  draft: { label: 'Draft', classes: 'bg-gray-100 text-gray-600' },
  pending: { label: 'Pending Review', classes: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Approved', classes: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', classes: 'bg-red-100 text-red-700' },
}

export default async function MySubmissionsPage({ searchParams }: Props) {
  const user = await requireAuth()
  const { page: pageParam, tab = 'all', submitted } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)

  const [{ submissions, total, perPage }, counts, profile, flags] = await Promise.all([
    getMySubmissions(user.id, { status: tab, page }),
    getMySubmissionCounts(user.id),
    getUserProfile(),
    getFeatureFlags(),
  ])

  const isAdmin = profile?.role === 'admin'
  const showPitches = flags.pitch_marketplace_enabled || isAdmin
  const sidebarLinks: Array<[string, string]> = [
    ['My Account', '/membership-account'],
    ...(showPitches ? ([['My Pitches', '/membership-account/my-pitches']] as Array<[string, string]>) : []),
    ['My Submissions', '/membership-account/my-submissions'],
    ['Billing', '/membership-account/membership-billing'],
    ['Cancel', '/membership-account/membership-cancel'],
    ['Membership Plans', '/membership-plans'],
    ['Invoice', '/membership-account/membership-invoice'],
  ]

  const totalPages = Math.ceil(total / perPage)

  const tabs = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'draft', label: 'Drafts', count: counts.draft },
    { key: 'pending', label: 'Pending', count: counts.pending },
    { key: 'approved', label: 'Approved', count: counts.approved },
    { key: 'rejected', label: 'Rejected', count: counts.rejected },
  ] as const

  return (
    <div className="page-wrap py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar nav */}
        <aside className="lg:w-56 flex-shrink-0">
          <nav className="white-bg p-4 space-y-1">
            {sidebarLinks.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className={`block px-3 py-2 rounded text-sm ${
                  href === '/membership-account/my-submissions'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-gray-700 hover:bg-primary/10 hover:text-primary'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <div className="flex-1 space-y-6">
          {submitted === '1' && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              Your production has been submitted for review. We&apos;ll notify you by email once it&apos;s been reviewed.
            </div>
          )}

          {/* CTA banner — prominent for first-time users, compact after first submission */}
          {counts.all === 0 ? (
            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-lg p-8">
              <h2 className="text-xl font-bold text-primary mb-2">Help Build the Industry&apos;s Most Complete Production Database</h2>
              <p className="text-gray-700 mb-4 max-w-2xl">
                Know about a production that&apos;s not listed? Whether it&apos;s in development, pre-production, or already filming &mdash; submit it here and help fellow industry professionals discover new opportunities to connect, collaborate, and find work.
              </p>
              <Link
                href="/submit-production"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-primary text-white font-medium rounded hover:bg-primary/90 transition-colors"
              >
                + Submit a Production
              </Link>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-primary/5 border border-primary/10 rounded-lg px-5 py-3">
              <p className="text-sm text-gray-600">
                Know about a production that&apos;s not listed? <Link href="/submit-production" className="text-primary font-medium hover:underline">Submit it here</Link> and help the community discover new opportunities.
              </p>
            </div>
          )}

          <div className="white-bg p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-primary">My Submissions</h1>
              <Link
                href="/submit-production"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded hover:bg-primary/90 transition-colors"
              >
                + Submit Production
              </Link>
            </div>

            {/* Tabs */}
            <div className="flex gap-6 border-b border-gray-200 mb-6">
              {tabs.map((t) => (
                <Link
                  key={t.key}
                  href={`/membership-account/my-submissions${t.key === 'all' ? '' : `?tab=${t.key}`}`}
                  className={`pb-2 text-sm font-medium transition-colors ${
                    tab === t.key
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t.label}
                  <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                    {t.count}
                  </span>
                </Link>
              ))}
            </div>

            {/* Submissions table */}
            {submissions.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="pb-2 font-medium">Title</th>
                        <th className="pb-2 font-medium">Type</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Submitted</th>
                        <th className="pb-2 font-medium">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map((s) => {
                        const badge = STATUS_BADGES[s.status] ?? STATUS_BADGES.draft
                        const linkHref = s.status === 'draft'
                          ? '/submit-production'
                          : `/membership-account/my-submissions/${s.id}`
                        return (
                          <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="py-3">
                              <Link href={linkHref} className="text-primary hover:underline font-medium">
                                {s.title || 'Untitled'}
                              </Link>
                            </td>
                            <td className="py-3 text-gray-500">
                              {s.type_name || '-'}
                            </td>
                            <td className="py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${badge.classes}`}>
                                {badge.label}
                              </span>
                            </td>
                            <td className="py-3 text-gray-500">
                              {s.submitted_at ? formatDate(s.submitted_at) : '-'}
                            </td>
                            <td className="py-3 text-gray-500">
                              {formatDate(s.updated_at)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6">
                    {page > 1 && (
                      <Link
                        href={`/membership-account/my-submissions?tab=${tab}&page=${page - 1}`}
                        className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                      >
                        Previous
                      </Link>
                    )}
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <Link
                        key={p}
                        href={`/membership-account/my-submissions?tab=${tab}&page=${p}`}
                        className={`px-3 py-1 text-sm border rounded ${
                          p === page
                            ? 'bg-primary text-white border-primary'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        {p}
                      </Link>
                    ))}
                    {page < totalPages && (
                      <Link
                        href={`/membership-account/my-submissions?tab=${tab}&page=${page + 1}`}
                        className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                      >
                        Next
                      </Link>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">
                  {tab === 'all'
                    ? "You haven't submitted any productions yet."
                    : `No ${tab} submissions.`}
                </p>
                <Link
                  href="/submit-production"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded hover:bg-primary/90 transition-colors"
                >
                  + Submit Production
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
