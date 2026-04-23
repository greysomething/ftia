'use client'

import { useState } from 'react'
import { getCrewProfileImageUrl } from '@/lib/crew-avatar'

interface CrewAvatarProps {
  name: string
  profileImageUrl?: string | null
  linkedin?: string | null
  /** Pixel size for both width and height (avatar is always square + circular). */
  size?: number
  /** Extra classes appended to the wrapper (e.g. shadow utilities). */
  className?: string
  /**
   * When true, two-letter initials. When false, just the first letter.
   * Defaults to true for larger sizes (>=48px) and false for smaller ones.
   */
  twoLetterInitials?: boolean
}

/**
 * Renders a circular crew member avatar.
 *
 *   - If a profile image URL is available (manual upload OR unavatar.io
 *     fallback derived from LinkedIn), renders an <img>.
 *   - On image load failure (e.g. unavatar 404 because the LinkedIn slug
 *     doesn't resolve), gracefully falls back to colored initials.
 *
 * Client component because we need onError → swap-to-initials behavior.
 * The wrapping page can remain a server component.
 */
export function CrewAvatar({
  name,
  profileImageUrl,
  linkedin,
  size = 36,
  className = '',
  twoLetterInitials,
}: CrewAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false)

  const photoUrl = getCrewProfileImageUrl({
    profile_image_url: profileImageUrl ?? null,
    linkedin: linkedin ?? null,
  })

  const useTwoLetters = twoLetterInitials ?? size >= 48
  const initials = useTwoLetters
    ? name
        .split(/\s+/)
        .filter(Boolean)
        .map((n) => n.charAt(0))
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : (name.charAt(0) || '?').toUpperCase()

  // Initials sizing: scale font to ~40% of the diameter.
  const fontPx = Math.max(10, Math.round(size * 0.42))

  const wrapperClasses = `rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center ${className}`
  const wrapperStyle = { width: size, height: size }

  if (photoUrl && !imageFailed) {
    return (
      <div className={`${wrapperClasses} bg-gray-100`} style={wrapperStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setImageFailed(true)}
        />
      </div>
    )
  }

  // Initials fallback. Color treatment matches the pre-existing dark-header
  // avatar on /production-role/[slug] for visual consistency.
  return (
    <div
      className={`${wrapperClasses} bg-gradient-to-br from-[#3ea8c8] to-[#2d8ba8] text-white font-bold`}
      style={{ ...wrapperStyle, fontSize: fontPx, lineHeight: 1 }}
    >
      {initials}
    </div>
  )
}
