import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAdminDnwNoticeById } from '@/lib/admin-queries'
import { DnwNoticeForm } from '@/components/admin/forms/DnwNoticeForm'
import { StatusBar } from '@/components/admin/StatusBar'

export const metadata: Metadata = { title: 'Edit Notice' }

interface Props { params: Promise<{ id: string }> }

export default async function EditDnwNoticePage({ params }: Props) {
  const { id } = await params
  const notice = await getAdminDnwNoticeById(Number(id)).catch(() => null)
  if (!notice) notFound()

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Edit Do Not Work Notice</h1>
      <StatusBar
        visibility={(notice as any).visibility ?? (notice as any).status}
        updatedAt={(notice as any).updated_at}
        type="notice"
      />
      <DnwNoticeForm notice={notice} />
    </div>
  )
}
