import Link from 'next/link'
import { PITCH_FORMAT_LABELS, DEVELOPMENT_STAGE_LABELS } from '@/lib/utils'
import type { PitchFormat, PitchDevelopmentStage } from '@/types/database'

interface Props {
  pitch: {
    id: number
    slug: string
    title: string
    logline: string
    format: PitchFormat
    development_stage: PitchDevelopmentStage
    view_count: number
    featured: boolean
    published_at: string | null
    pitch_genre_links?: Array<{ is_primary: boolean; pitch_genres: { id: number; name: string; slug: string } }>
    user_profiles?: { display_name: string | null; first_name: string | null; last_name: string | null; organization_name: string | null } | null
  }
}

const STAGE_COLORS: Record<PitchDevelopmentStage, string> = {
  'concept': 'bg-gray-100 text-gray-700',
  'treatment': 'bg-blue-100 text-blue-700',
  'script-in-progress': 'bg-amber-100 text-amber-700',
  'script-complete': 'bg-green-100 text-green-700',
  'package-attached': 'bg-purple-100 text-purple-700',
}

function getCreatorName(profile: Props['pitch']['user_profiles']): string {
  if (!profile) return 'Anonymous'
  if (profile.display_name) return profile.display_name
  if (profile.first_name || profile.last_name) {
    return [profile.first_name, profile.last_name].filter(Boolean).join(' ')
  }
  if (profile.organization_name) return profile.organization_name
  return 'Anonymous'
}

function truncateLogline(logline: string, maxLen = 150): string {
  if (logline.length <= maxLen) return logline
  return logline.substring(0, maxLen).replace(/\s+\S*$/, '') + '...'
}

export function PitchCard({ pitch }: Props) {
  const primaryGenre = pitch.pitch_genre_links?.find(g => g.is_primary)?.pitch_genres
  const creatorName = getCreatorName(pitch.user_profiles)

  return (
    <div className="relative bg-white p-5 hover:shadow-md transition-shadow border border-gray-100 rounded-xl">
      {/* Featured badge */}
      {pitch.featured && (
        <div className="absolute top-3 right-3">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Featured
          </span>
        </div>
      )}

      {/* Title */}
      <Link href={`/pitches/${pitch.slug}`} className="text-lg font-semibold text-primary hover:text-primary/80 transition-colors">
        {pitch.title}
      </Link>

      {/* Format + Genre badges */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        <span className="inline-block text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
          {PITCH_FORMAT_LABELS[pitch.format]}
        </span>
        {primaryGenre && (
          <span className="inline-block text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            {primaryGenre.name}
          </span>
        )}
      </div>

      {/* Logline */}
      <p className="text-sm text-gray-600 mt-2 line-clamp-3">
        {truncateLogline(pitch.logline)}
      </p>

      {/* Bottom row */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-50">
        <span className="text-xs text-gray-500">{creatorName}</span>

        <div className="flex items-center gap-3">
          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${STAGE_COLORS[pitch.development_stage]}`}>
            {DEVELOPMENT_STAGE_LABELS[pitch.development_stage]}
          </span>

          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {pitch.view_count}
          </span>
        </div>
      </div>
    </div>
  )
}

export default PitchCard
