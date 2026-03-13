import type { Metadata } from 'next'
import { getUser, isMember } from '@/lib/auth'
import { getDnwNotices } from '@/lib/queries'
import { formatDate } from '@/lib/utils'
import { MemberGate } from '@/components/MemberGate'
import { Pagination } from '@/components/Pagination'

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
  )
}
