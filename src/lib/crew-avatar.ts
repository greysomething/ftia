/**
 * Resolve a crew member's profile photo URL with a graceful fallback chain.
 *
 *   1. Manually-curated `profile_image_url` (admin upload)         ← always wins
 *   2. unavatar.io proxy of the LinkedIn slug                      ← free fallback
 *   3. null  → callers render initials in a colored circle instead
 *
 * Why unavatar.io? LinkedIn signs profile photo URLs with short-lived tokens
 * and prohibits direct scraping. unavatar.io is a public image proxy that
 * exposes a stable URL like `https://unavatar.io/linkedin/<slug>` and returns
 * a JPEG (or 404 / default placeholder if the profile isn't found).
 *
 * Limits to be aware of:
 *   - Third-party dependency; if unavatar is down, images don't render.
 *   - Soft rate limits on the free tier (per-IP); fine for our traffic but
 *     not unlimited.
 *   - Returns a 1×1 placeholder for missing profiles by default — we add
 *     `?fallback=false` so a missing photo 404s and the <Image> component
 *     can fall through to the initial.
 */

const LINKEDIN_HOST = /(?:^|\.)linkedin\.com$/i

/**
 * Pull the public profile slug out of a LinkedIn URL.
 *
 *   "https://www.linkedin.com/in/jane-doe-12345/"  → "jane-doe-12345"
 *   "linkedin.com/in/jane-doe?utm_source=foo"      → "jane-doe"
 *   "/in/jane-doe"                                 → "jane-doe"   (relative)
 *   "@jane-doe"                                    → null         (handle, not URL)
 *   "https://linkedin.com/company/acme"            → null         (company, not person)
 *
 * Returns null for anything that doesn't look like a personal profile URL.
 */
export function extractLinkedinSlug(linkedin: string | null | undefined): string | null {
  if (!linkedin) return null
  const trimmed = String(linkedin).trim()
  if (!trimmed) return null

  // Try parsing as a URL first; fall back to a relative-path interpretation.
  let pathname: string
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    if (u.hostname && !LINKEDIN_HOST.test(u.hostname)) return null
    pathname = u.pathname
  } catch {
    // Not a parseable URL — treat as a path-style string.
    pathname = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  }

  // Personal profiles live at /in/<slug>; company / school pages we ignore.
  const match = pathname.match(/\/in\/([^/?#]+)/i)
  if (!match) return null
  const slug = decodeURIComponent(match[1]).trim()
  return slug.length > 0 ? slug : null
}

/**
 * Returns the best available profile photo URL for a crew member, or null
 * when no source is usable (caller renders initials instead).
 */
export function getCrewProfileImageUrl(
  crew: { profile_image_url?: string | null; linkedin?: string | null } | null | undefined
): string | null {
  if (!crew) return null

  const manual = crew.profile_image_url?.trim()
  if (manual) return manual

  const slug = extractLinkedinSlug(crew.linkedin)
  if (!slug) return null

  // `fallback=false` makes unavatar return 404 instead of a placeholder so
  // we can fall through to initials cleanly.
  return `https://unavatar.io/linkedin/${encodeURIComponent(slug)}?fallback=false`
}
