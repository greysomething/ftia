import type { Metadata } from 'next'
import { getAdminMembershipPlanById } from '@/lib/admin-queries'
import { MembershipPlanForm } from '@/components/admin/forms/MembershipPlanForm'
import { notFound } from 'next/navigation'

export const metadata: Metadata = { title: 'Edit Membership Plan' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditMembershipPlanPage({ params }: Props) {
  const { id } = await params
  let plan
  try {
    plan = await getAdminMembershipPlanById(parseInt(id, 10))
  } catch {
    notFound()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Plan: {plan.name}</h1>
      <MembershipPlanForm plan={plan} />
    </div>
  )
}
