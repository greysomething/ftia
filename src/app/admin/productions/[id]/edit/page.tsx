import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAdminProductionById, getProductionTypeOptions, getProductionStatusOptions } from '@/lib/admin-queries'
import { ProductionForm } from '@/components/admin/forms/ProductionForm'

export const metadata: Metadata = { title: 'Edit Production' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditProductionPage({ params }: Props) {
  const { id } = await params

  const [production, typeOptions, statusOptions] = await Promise.all([
    getAdminProductionById(Number(id)).catch((err) => {
      console.error(`[edit-production] Failed to load production ${id}:`, err?.message ?? err)
      return null
    }),
    getProductionTypeOptions(),
    getProductionStatusOptions(),
  ])

  if (!production) notFound()

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Production</h1>
      <ProductionForm production={production} typeOptions={typeOptions} statusOptions={statusOptions} />
    </div>
  )
}
