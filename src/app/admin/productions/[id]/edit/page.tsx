import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAdminProductionById, getProductionTypeOptions, getProductionStatusOptions } from '@/lib/admin-queries'
import { ProductionForm } from '@/components/admin/forms/ProductionForm'
import { StatusBar } from '@/components/admin/StatusBar'

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
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Edit Production</h1>
      <StatusBar
        visibility={production.visibility}
        updatedAt={production.wp_updated_at ?? production.updated_at}
        type="production"
      />
      <ProductionForm production={production} typeOptions={typeOptions} statusOptions={statusOptions} />
    </div>
  )
}
