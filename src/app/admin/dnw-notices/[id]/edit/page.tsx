import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAdminDnwNoticeById } from '@/lib/admin-queries'
import { DnwNoticeForm } from '@/components/admin/forms/DnwNoticeForm'

export const metadata: Metadata = { title: 'Edit Notice' }

interface Props { params: Promise<{ id: string }> }

export default async function EditDnwNoticePage({ params }: Props) {
  const { id } = await params
  const notice = await getAdminDnwNoticeById(Number(id)).catch(() => null)
  if (!notice) notFound()

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Do Not Work Notice</h1>
      <DnwNoticeForm notice={notice} />
    </div>
  )
}
