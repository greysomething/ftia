import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getUser, isMember } from '@/lib/auth'
import { gatePublicPitchRoute } from '@/lib/pitch-marketplace-gate'
import {
  getPitchBySlug,
  getPitchSlugs,
  getUserFavorites,
  incrementViewCount,
} from '@/lib/pitch-queries'
import {
  PITCH_FORMAT_LABELS,
  BUDGET_RANGE_LABELS,
  DEVELOPMENT_STAGE_LABELS,
  formatDate,
} from '@/lib/utils'
import { PitchFavoriteButton } from '@/components/PitchFavoriteButton'
import type { PitchFormat, PitchBudgetRange, PitchDevelopmentStage } from '@/types/database'

export async function generateStaticParams() {
  const slugs = await getPitchSlugs()
  return slugs.map((slug: string) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const pitch = await getPitchBySlug(slug)
  if (!pitch) return { title: 'Pitch Not Found' }
  return {
    title: `${pitch.title} | Pitch Marketplace`,
    description: pitch.logline,
  }
}

interface Props {
  params: Promise<{ slug: string }>
}

const FORMAT_BADGE = 'bg-blue-50 text-blue-700'
const GENRE_BADGE = 'bg-gray-100 text-gray-600'
const BUDGET_BADGE = 'bg-emerald-50 text-emerald-700'

const STAGE_COLORS: Record<PitchDevelopmentStage, string> = {
  concept: 'bg-gray-100 text-gray-700',
  treatment: 'bg-blue-100 text-blue-700',
  'script-in-progress': 'bg-amber-100 text-amber-700',
  'script-complete': 'bg-green-100 text-green-700',
  'package-attached': 'bg-purple-100 text-purple-700',
}

const FILE_TYPE_LABELS: Record<string, string> = {
  script: 'Script',
  'pitch-deck': 'Pitch Deck',
  treatment: 'Treatment',
  other: 'Other',
}

function getCreatorName(profile: any): string {
  if (!profile) return 'Anonymous'
  if (profile.display_name) return profile.display_name
  if (profile.first_name || profile.last_name) {
    return [profile.first_name, profile.last_name].filter(Boolean).join(' ')
  }
  if (profile.organization_name) return profile.organization_name
  return 'Anonymous'
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function PitchDetailPage({ params }: Props) {
  // Hide from non-admins until the marketplace flag is on.
  await gatePublicPitchRoute()

  const { slug } = await params
  const pitch = await getPitchBySlug(slug)

  if (!pitch || pitch.visibility !== 'publish') {
    notFound()
  }

  // Fire and forget view count increment
  incrementViewCount(pitch.id).catch(() => {})

  const user = await getUser()
  const member = user ? await isMember(user.id) : false
  const favorites = user ? await getUserFavorites(user.id) : new Set<number>()
  const isFavorited = favorites.has(pitch.id)

  // Extract genre data
  const genres = (pitch.pitch_genre_links ?? [])
    .map((g: any) => g.pitch_genres)
    .filter(Boolean)
  const primaryGenre = (pitch.pitch_genre_links ?? []).find(
    (g: any) => g.is_primary,
  )?.pitch_genres

  const creatorName = getCreatorName(pitch.user_profiles)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  return (
    <div className="page-wrap py-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/pitches" className="hover:text-primary transition-colors">
          Pitch Marketplace
        </Link>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
        {primaryGenre && (
          <>
            <Link
              href={`/pitches?genre=${primaryGenre.slug}`}
              className="hover:text-primary transition-colors"
            >
              {primaryGenre.name}
            </Link>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </>
        )}
        <span className="text-gray-700 truncate">{pitch.title}</span>
      </nav>

      <div className="max-w-4xl mx-auto">
        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-900 mb-4">{pitch.title}</h1>

        {/* Badges row */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span
            className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${FORMAT_BADGE}`}
          >
            {PITCH_FORMAT_LABELS[pitch.format as PitchFormat]}
          </span>
          {genres.map((genre: any) => (
            <Link
              key={genre.id}
              href={`/pitches?genre=${genre.slug}`}
              className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${GENRE_BADGE} hover:bg-gray-200 transition-colors`}
            >
              {genre.name}
            </Link>
          ))}
          <span
            className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${STAGE_COLORS[pitch.development_stage as PitchDevelopmentStage]}`}
          >
            {DEVELOPMENT_STAGE_LABELS[pitch.development_stage as PitchDevelopmentStage]}
          </span>
          {pitch.budget_range && (
            <span
              className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${BUDGET_BADGE}`}
            >
              {BUDGET_RANGE_LABELS[pitch.budget_range as PitchBudgetRange]}
            </span>
          )}
        </div>

        {/* Logline */}
        <div className="bg-primary/5 border-l-4 border-primary p-4 text-gray-700 italic mb-6">
          {pitch.logline}
        </div>

        {/* Creator info + meta */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 pb-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {pitch.user_profiles?.avatar_url ? (
              <img
                src={pitch.user_profiles.avatar_url}
                alt={creatorName}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-semibold text-sm">
                  {creatorName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">
                Submitted by {creatorName}
              </p>
              {pitch.user_profiles?.organization_name && (
                <p className="text-xs text-gray-500">
                  {pitch.user_profiles.organization_name}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500">
            {pitch.published_at && (
              <span>Published {formatDate(pitch.published_at)}</span>
            )}
            <span className="inline-flex items-center gap-1">
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              {pitch.view_count ?? 0} views
            </span>
            {user && (
              <PitchFavoriteButton pitchId={pitch.id} initialFavorited={isFavorited} />
            )}
          </div>
        </div>

        {/* ===== Member-Gated Content ===== */}
        {!user ? (
          /* Not logged in */
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Sign in to view full details
            </h3>
            <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
              Sign in to view full pitch details including synopsis, attachments, and creator
              contact information.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-primary text-white font-medium text-sm px-6 py-2.5 rounded-lg hover:bg-primary/90 transition-colors"
            >
              Log In
            </Link>
          </div>
        ) : !member ? (
          /* Logged in but not a member */
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Upgrade to access full details
            </h3>
            <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
              Upgrade to a membership to access full pitch details, scripts, and connect with
              creators.
            </p>
            <Link
              href="/membership-plans"
              className="inline-flex items-center gap-2 bg-primary text-white font-medium text-sm px-6 py-2.5 rounded-lg hover:bg-primary/90 transition-colors"
            >
              View Membership Plans
            </Link>
          </div>
        ) : (
          /* Member — show full details */
          <div className="space-y-8">
            {/* Synopsis */}
            {pitch.synopsis && (
              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Synopsis</h2>
                <div className="text-gray-700 leading-relaxed whitespace-pre-line">
                  {pitch.synopsis}
                </div>
              </section>
            )}

            {/* Comparable Titles */}
            {pitch.comparable_titles && (
              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Comparable Titles</h2>
                <div className="text-gray-700 leading-relaxed whitespace-pre-line">
                  {pitch.comparable_titles}
                </div>
              </section>
            )}

            {/* Target Audience */}
            {pitch.target_audience && (
              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Target Audience</h2>
                <div className="text-gray-700 leading-relaxed whitespace-pre-line">
                  {pitch.target_audience}
                </div>
              </section>
            )}

            {/* Unique Selling Points */}
            {pitch.unique_selling_points && (
              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-3">
                  Unique Selling Points
                </h2>
                <div className="text-gray-700 leading-relaxed whitespace-pre-line">
                  {pitch.unique_selling_points}
                </div>
              </section>
            )}

            {/* Attachments */}
            {pitch.pitch_attachments && pitch.pitch_attachments.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Attachments</h2>
                <div className="space-y-2">
                  {pitch.pitch_attachments.map((att: any) => {
                    const downloadUrl = supabaseUrl
                      ? `${supabaseUrl}/storage/v1/object/public/media/${att.storage_path}`
                      : '#'
                    return (
                      <a
                        key={att.id}
                        href={downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors group"
                      >
                        <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-5 h-5 text-red-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate group-hover:text-primary transition-colors">
                            {att.file_name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs font-medium text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">
                              {FILE_TYPE_LABELS[att.file_type] ?? att.file_type}
                            </span>
                            {att.file_size && (
                              <span className="text-xs text-gray-400">
                                {formatFileSize(att.file_size)}
                              </span>
                            )}
                          </div>
                        </div>
                        <svg
                          className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                      </a>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
