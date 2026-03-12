import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAdminCrewById } from '@/lib/admin-queries'
import { CrewForm } from '@/components/admin/forms/CrewForm'

export const metadata: Metadata = { title: 'Edit Crew' }

interface Props { params: Promise<{ id: string }> }

export default async function EditCrewPage({ params }: Props) {
  const { id } = await params
  const crew = await getAdminCrewById(Number(id)).catch(() => null)
  if (!crew) notFound()

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Crew Member</h1>
      <CrewForm crew={crew} />
    </div>
  )
}
