import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAdminCompanyById } from '@/lib/admin-queries'
import { StatusBar } from '@/components/admin/StatusBar'
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Edit Company</h1>
      <StatusBar
        visibility={(company as any).visibility}
        updatedAt={(company as any).wp_updated_at ?? (company as any).updated_at}
        type="company"
      />
      <CompanyEditClient company={company as any} initialStaff={staffData} />
    </div>
  )
}
