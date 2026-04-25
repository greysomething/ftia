import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { gatePublicPitchRoute } from '@/lib/pitch-marketplace-gate'
import { getPitchById, getPitchGenres } from '@/lib/pitch-queries'
import { PitchForm } from '@/components/PitchForm'

export const metadata: Metadata = {
  title: 'Edit Pitch | Production List',
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditPitchPage({ params }: Props) {
  await gatePublicPitchRoute()
  const user = await requireAuth()
  const { id } = await params
  const [pitch, genres] = await Promise.all([
    getPitchById(Number(id)),
    getPitchGenres(),
  ])

  if (!pitch) notFound()
  if (pitch.user_id !== user.id) notFound()

  const pitchGenreIds = (pitch.pitch_genre_links ?? []).map((l: any) => l.genre_id)
  const attachments = pitch.pitch_attachments ?? []

  return (
    <div className="page-wrap py-8">
      <div className="mb-6">
        <nav className="text-sm text-gray-500 mb-2">
          <Link href="/membership-account/my-pitches" className="hover:text-primary">My Pitches</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">Edit Pitch</span>
        </nav>
        <h1 className="text-2xl font-bold text-primary">Edit Pitch</h1>
      </div>
      <PitchForm
        pitch={pitch}
        genres={genres}
        pitchGenreIds={pitchGenreIds}
        attachments={attachments}
      />
    </div>
  )
}
