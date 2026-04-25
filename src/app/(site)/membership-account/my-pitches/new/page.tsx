import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { gatePublicPitchRoute } from '@/lib/pitch-marketplace-gate'
import { getPitchGenres } from '@/lib/pitch-queries'
import { PitchForm } from '@/components/PitchForm'

export const metadata: Metadata = {
  title: 'New Pitch | Production List',
}

export default async function NewPitchPage() {
  await gatePublicPitchRoute()
  await requireAuth()
  const genres = await getPitchGenres()

  return (
    <div className="page-wrap py-8">
      <div className="mb-6">
        <nav className="text-sm text-gray-500 mb-2">
          <Link href="/membership-account/my-pitches" className="hover:text-primary">My Pitches</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">New Pitch</span>
        </nav>
        <h1 className="text-2xl font-bold text-primary">Create New Pitch</h1>
      </div>
      <PitchForm genres={genres} />
    </div>
  )
}
