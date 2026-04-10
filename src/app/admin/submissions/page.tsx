import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminSubmissions } from '@/lib/submission-queries'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Submissions',
}

interface Props {
  searchParams: Promise<{ page?: string; status?: string }>
}

const STATUS_BADGES: Record<string, { label: string; classes: string }> = {
  draft: { label: 'Draft', classes: 'bg-gray-100 text-gray-600' },
  pending: { label: 'Pending', classes: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Approved', classes: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', classes: 'bg-red-100 text-red-700' },
}

export default async function AdminSubmissionsPage({ searchParams }: Props) {
  const { page: pageParam, status = 'pending' } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)

  const { submissions, total, perPage } = await getAdminSubmissions({ status, page })
  const totalPages = Math.ceil(total / perPage)

  const tabs = [
    { key: 'pending', label: 'Pending' },
    { key: 'all', label: 'All' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'draft', label: 'Drafts' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Production Submissions</h1>
        <span className="text-sm text-gray-500">{total} total</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 mb-6">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin/submissions${t.key === 'pending' ? '' : `?status=${t.key}`}`}
            className={`pb-2 text-sm font-medium transition-colors ${
              status === t.key
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {submissions.length > 0 ? (
        <>
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Company</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Submitted</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => {
                  const badge = STATUS_BADGES[s.status] ?? STATUS_BADGES.draft
                  return (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/submissions/${s.id}`}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {s.title || 'Untitled'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{s.type_name || '-'}</td>
                      <td className="px-4 py-3 text-gray-500">{s.production_company || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.classes}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {s.submitted_at ? formatDate(s.submitted_at) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/submissions/${s.id}`}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              {page > 1 && (
                <Link
                  href={`/admin/submissions?status=${status}&page=${page - 1}`}
                  className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                >
                  Previous
                </Link>
              )}
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={`/admin/submissions?status=${status}&page=${page + 1}`}
                  className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                >
                  Next
                </Link>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
          <p className="text-gray-500">No {status === 'all' ? '' : status} submissions found.</p>
        </div>
      )}
    </div>
  )
}
