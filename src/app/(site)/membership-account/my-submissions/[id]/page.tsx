import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { getMySubmission, getProductionTypeAndStatusOptions, checkSubmissionRateLimit } from '@/lib/submission-queries'
import SubmissionForm from '@/components/SubmissionForm'

export const metadata: Metadata = {
  title: 'Submission Details | Production List',
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function SubmissionDetailPage({ params }: Props) {
  const user = await requireAuth()
  const { id } = await params
  const submissionId = Number(id)

  if (!submissionId || isNaN(submissionId)) notFound()

  const { submission } = await getMySubmission(submissionId)

  // RLS ensures user can only see their own, but double-check
  if (!submission || submission.user_id !== user.id) notFound()

  const [rateLimit, { types, statuses }] = await Promise.all([
    checkSubmissionRateLimit(user.id),
    getProductionTypeAndStatusOptions(),
  ])

  return (
    <div className="page-wrap py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/membership-account/my-submissions" className="text-sm text-gray-500 hover:text-primary">
            &larr; Back to My Submissions
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-primary mb-6">
          {submission.title || 'Untitled Submission'}
        </h1>

        <div className="white-bg p-6">
          <SubmissionForm
            submission={submission}
            typeOptions={types}
            statusOptions={statuses}
            rateLimit={rateLimit}
          />
        </div>
      </div>
    </div>
  )
}
