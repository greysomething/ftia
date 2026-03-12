import type { Metadata } from 'next'
import { ProductionForm } from '@/components/admin/forms/ProductionForm'

export const metadata: Metadata = { title: 'New Production' }

export default function NewProductionPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Production</h1>
      <ProductionForm />
    </div>
  )
}
