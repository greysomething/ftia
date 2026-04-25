import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAdminPitchById } from '@/lib/pitch-admin-queries'
import { getPitchGenres } from '@/lib/pitch-queries'
import { PitchAdminForm } from '@/components/admin/forms/PitchAdminForm'

export const metadata: Metadata = {
  title: 'Edit Pitch | Admin',
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdminEditPitchPage({ params }: Props) {
  const { id } = await params
  const [pitch, genres] = await Promise.all([
    getAdminPitchById(Number(id)),
    getPitchGenres(),
  ])

  if (!pitch) notFound()

  const pitchGenreIds = (pitch.pitch_genre_links ?? []).map((l: any) => l.genre_id)
  const attachments = pitch.pitch_attachments ?? []

  return (
    <div>
      <nav className="text-sm text-gray-500 mb-4">
        <Link href="/admin/pitches" className="hover:text-[#3ea8c8]">Pitches</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{pitch.title}</span>
      </nav>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Edit Pitch</h1>
        {pitch.visibility === 'publish' && pitch.slug && (
          <Link href={`/pitches/${pitch.slug}`} target="_blank" className="text-sm text-[#3ea8c8] hover:underline">
            View Live &rarr;
          </Link>
        )}
      </div>
      <div className="mb-4 flex items-center gap-3 text-sm text-gray-500">
        <span>Creator: {(pitch as any).user_profiles?.display_name || (pitch as any).user_profiles?.first_name || 'Unknown'}</span>
        <span>&middot;</span>
        <span>Views: {pitch.view_count}</span>
      </div>
      <PitchAdminForm
        pitch={pitch}
        genres={genres}
        pitchGenreIds={pitchGenreIds}
        attachments={attachments}
      />
    </div>
  )
}
