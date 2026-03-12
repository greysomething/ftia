import type { Metadata } from 'next'
import { CompanyForm } from '@/components/admin/forms/CompanyForm'

export const metadata: Metadata = { title: 'New Company' }

export default function NewCompanyPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Company</h1>
      <CompanyForm />
    </div>
  )
}
