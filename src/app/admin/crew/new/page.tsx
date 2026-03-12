import type { Metadata } from 'next'
import { CrewForm } from '@/components/admin/forms/CrewForm'

export const metadata: Metadata = { title: 'New Crew' }

export default function NewCrewPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Crew Member</h1>
      <CrewForm />
    </div>
  )
}
