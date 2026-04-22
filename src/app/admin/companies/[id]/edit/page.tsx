import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAdminCompanyById } from '@/lib/admin-queries'
import { StatusBar } from '@/components/admin/StatusBar'
import { CompletenessPill } from '@/components/admin/CompletenessPill'
import { scoreCompany } from '@/lib/completeness'
import { CompanyEditClient } from './CompanyEditClient'

export const metadata: Metadata = { title: 'Edit Company' }

interface Props { params: Promise<{ id: string }> }

export default async function EditCompanyPage({ params }: Props) {
  const { id } = await params
  const company = await getAdminCompanyById(Number(id)).catch(() => null)
  if (!company) notFound()

  const staffData = ((company as any).company_staff ?? []).sort(
    (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  )

  const completeness = scoreCompany({
    addresses: (company as any).addresses,
    phones:    (company as any).phones,
    emails:    (company as any).emails,
    website:   (company as any).website,
    linkedin:  (company as any).linkedin,
    twitter:   (company as any).twitter,
    instagram: (company as any).instagram,
    content:   (company as any).content,
    staff_count: staffData.length,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Edit Company</h1>
          <CompletenessPill result={completeness} size="md" />
        </div>
        <Link
          href={`/production-contact/${(company as any).slug}`}
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
        visibility={(company as any).visibility}
        updatedAt={(company as any).wp_updated_at ?? (company as any).updated_at}
        type="company"
      />
      <CompanyEditClient company={company as any} initialStaff={staffData} />
    </div>
  )
}
