import type { Metadata } from 'next'
import { getProductionTypeOptions, getProductionStatusOptions } from '@/lib/admin-queries'
import { ProductionForm } from '@/components/admin/forms/ProductionForm'

export const metadata: Metadata = { title: 'New Production' }

export default async function NewProductionPage() {
  const [typeOptions, statusOptions] = await Promise.all([
    getProductionTypeOptions(),
    getProductionStatusOptions(),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Production</h1>
      <ProductionForm typeOptions={typeOptions} statusOptions={statusOptions} />
    </div>
  )
}
