import type { Metadata } from 'next'
import { DnwNoticeForm } from '@/components/admin/forms/DnwNoticeForm'

export const metadata: Metadata = { title: 'New Notice' }

export default function NewDnwNoticePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Do Not Work Notice</h1>
      <DnwNoticeForm />
    </div>
  )
}
