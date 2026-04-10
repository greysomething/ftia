import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAdminSubmission, getProductionTypeAndStatusOptions } from '@/lib/submission-queries'
import AdminSubmissionReview from './AdminSubmissionReview'

export const metadata: Metadata = {
  title: 'Review Submission',
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdminSubmissionDetailPage({ params }: Props) {
  const { id } = await params
  const submissionId = Number(id)
  if (!submissionId || isNaN(submissionId)) notFound()

  const { submission } = await getAdminSubmission(submissionId)
  if (!submission) notFound()

  const { types, statuses } = await getProductionTypeAndStatusOptions()

  return (
    <div>
      <AdminSubmissionReview
        submission={submission}
        typeOptions={types}
        statusOptions={statuses}
      />
    </div>
  )
}
