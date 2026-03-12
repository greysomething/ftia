import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAdminCompanyById } from '@/lib/admin-queries'
import { CompanyForm } from '@/components/admin/forms/CompanyForm'

export const metadata: Metadata = { title: 'Edit Company' }

interface Props { params: Promise<{ id: string }> }

export default async function EditCompanyPage({ params }: Props) {
  const { id } = await params
  const company = await getAdminCompanyById(Number(id)).catch(() => null)
  if (!company) notFound()

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Company</h1>
      <CompanyForm company={company} />
    </div>
  )
}
