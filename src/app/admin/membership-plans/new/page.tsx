import type { Metadata } from 'next'
import { MembershipPlanForm } from '@/components/admin/forms/MembershipPlanForm'

export const metadata: Metadata = { title: 'New Membership Plan' }

export default function NewMembershipPlanPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Plan</h1>
      <MembershipPlanForm />
    </div>
  )
}
