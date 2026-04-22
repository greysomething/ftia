import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAdminCrewById } from '@/lib/admin-queries'
import { CrewForm } from '@/components/admin/forms/CrewForm'
import { StatusBar } from '@/components/admin/StatusBar'
import { CompletenessPill } from '@/components/admin/CompletenessPill'
import { scoreCrew } from '@/lib/completeness'

export const metadata: Metadata = { title: 'Edit Crew' }

interface Props { params: Promise<{ id: string }> }

export default async function EditCrewPage({ params }: Props) {
  const { id } = await params
  const crew = await getAdminCrewById(Number(id)).catch(() => null)
  if (!crew) notFound()

  const staffArr = (crew as any).company_staff
  const companyLinkCount = Array.isArray(staffArr) ? (staffArr[0]?.count ?? 0) : 0
  const completeness = scoreCrew({
    emails:    (crew as any).emails,
    phones:    (crew as any).phones,
    roles:     (crew as any).roles,
    location:  (crew as any).location,
    website:   (crew as any).website,
    linkedin:  (crew as any).linkedin,
    twitter:   (crew as any).twitter,
    instagram: (crew as any).instagram,
    imdb:      (crew as any).imdb,
    content:   (crew as any).content,
    company_link_count: companyLinkCount,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Edit Crew Member</h1>
          <CompletenessPill result={completeness} size="md" />
        </div>
        <Link
          href={`/production-role/${(crew as any).slug}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-primary bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:border-gray-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          View on Site
        </Link>
      </div>
      <StatusBar
        visibility={(crew as any).visibility}
        updatedAt={(crew as any).wp_updated_at ?? (crew as any).updated_at}
        type="crew member"
      />
      <CrewForm crew={crew} />
    </div>
  )
}
