import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { getMySubmissions, checkSubmissionRateLimit, getProductionTypeAndStatusOptions } from '@/lib/submission-queries'
import SubmissionForm from '@/components/SubmissionForm'

export const metadata: Metadata = {
  title: 'Submit a Production | Production List',
  description: 'Submit a film or TV production for listing on Production List.',
}

export default async function SubmitProductionPage() {
  const user = await requireAuth()

  // Check if user has an existing draft — load it instead of creating a blank form
  const { submissions: drafts } = await getMySubmissions(user.id, { status: 'draft', perPage: 1 })
  const existingDraft = drafts.length > 0 ? drafts[0] : null

  const [rateLimit, { types, statuses }] = await Promise.all([
    checkSubmissionRateLimit(user.id),
    getProductionTypeAndStatusOptions(),
  ])

  return (
    <div className="page-wrap py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-primary">Submit a Production</h1>
            <p className="text-sm text-gray-600 mt-1">
              Submit a film or TV production for review and publishing on Production List.
            </p>
          </div>
          <Link
            href="/membership-account/my-submissions"
            className="text-sm text-primary hover:underline"
          >
            My Submissions
          </Link>
        </div>

        <div className="white-bg p-6">
          <SubmissionForm
            submission={existingDraft}
            typeOptions={types}
            statusOptions={statuses}
            rateLimit={rateLimit}
          />
        </div>
      </div>
    </div>
  )
}
