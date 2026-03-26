import type { ProductionPhase } from '@/types/database'

export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ')
}

const TZ = 'America/Los_Angeles'

/** Format YYYYMMDD or ISO date string to "Month YYYY" */
export function formatProductionDate(raw: string | null | undefined): string {
  if (!raw) return 'TBA'
  // Handle YYYYMMDD (WP format)
  if (/^\d{8}$/.test(raw)) {
    const year = raw.slice(0, 4)
    const month = parseInt(raw.slice(4, 6), 10) - 1
    const d = new Date(parseInt(year), month, 1)
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: TZ })
  }
  const d = new Date(raw)
  if (isNaN(d.getTime())) return 'TBA'
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: TZ })
}

/** Format ISO date to "Jan 15, 2024" (Pacific Time) */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ })
}

/** Format ISO datetime to "Jan 15, 2024, 3:45 PM" (Pacific Time) */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ })
}

export const PHASE_LABELS: Record<ProductionPhase, string> = {
  'in-pre-production': 'In Development / Pre-Production',
  'in-production': 'In Production',
  'in-post-production': 'In Post-Production',
  'completed': 'Completed',
}

export const PHASE_COLORS: Record<ProductionPhase, string> = {
  'in-pre-production': 'bg-blue-100 text-blue-800',
  'in-production': 'bg-green-100 text-green-800',
  'in-post-production': 'bg-purple-100 text-purple-800',
  'completed': 'bg-gray-100 text-gray-600',
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Format a phone number into a consistent readable format.
 * Handles: "3105551234", "+13105551234", "(310) 555-1234", "310-555-1234", "310.555.1234"
 * Returns: "(310) 555-1234" for US numbers, original string for international/non-standard
 */
export function formatPhone(phone: string): string {
  if (!phone) return ''
  const cleaned = phone.replace(/[^\d+]/g, '')
  // US 10-digit or 11-digit with leading 1
  const usMatch = cleaned.match(/^(?:\+?1)?(\d{3})(\d{3})(\d{4})$/)
  if (usMatch) return `(${usMatch[1]}) ${usMatch[2]}-${usMatch[3]}`
  // 7-digit local
  const localMatch = cleaned.match(/^(\d{3})(\d{4})$/)
  if (localMatch) return `${localMatch[1]}-${localMatch[2]}`
  // If it already looks formatted (has parens, dashes, spaces), return as-is
  if (/[\(\)\-\s]/.test(phone) && /\d/.test(phone)) return phone.trim()
  return phone.trim()
}

/** Mask contact info for non-members */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '●●●●●@●●●●.com'
  return `${local.slice(0, 2)}●●●@${domain}`
}

export function maskPhone(phone: string): string {
  if (!phone) return ''
  return phone.replace(/\d(?=\d{4})/g, '●')
}

/** Generate media URL from Supabase Storage or original WP URL */
export function getMediaUrl(storagePath: string | null, originalUrl: string | null): string {
  // If we have a storage_path, construct URL to production WP uploads
  // (media files live on productionlist.com, not in Supabase Storage)
  if (storagePath) {
    return `https://productionlist.com/wp-content/uploads/${storagePath}`
  }
  // Fix local WP URLs to production
  if (originalUrl?.includes('productionlist-wp-local.local')) {
    return originalUrl.replace(
      /https?:\/\/productionlist-wp-local\.local\/wp-content\/uploads/,
      'https://productionlist.com/wp-content/uploads'
    )
  }
  return originalUrl ?? '/images/placeholder.svg'
}

/** Get featured image URL from a post with media relation */
export function getFeaturedImageUrl(post: any): string | null {
  const media = post?.media
  if (!media) return null
  return getMediaUrl(media.storage_path ?? null, media.original_url ?? null)
}

/** Format a production location from its component fields */
export function formatLocation(loc: {
  location?: string | null
  city?: string | null
  stage?: string | null
  country?: string | null
}): string {
  const city = loc.city?.trim() || null
  const stage = loc.stage?.trim() || null    // state/province (WP called it "stage")
  const country = loc.country?.trim() || null

  if (city || stage || country) {
    // For US locations: "City, ST" (omit "United States")
    // For other countries: "City, Country" or "City, Region, Country"
    const isUS = country === 'United States' || country === 'US' || country === 'USA'
    const isCanada = country === 'Canada'
    const isUK = country === 'United Kingdom' || country === 'UK'

    if (isUS || isCanada) {
      // US/Canada: "City, ST" — state abbreviation is in stage
      if (city && stage) return `${city}, ${stage}`
      if (city) return city
      if (stage) return stage
    }

    if (isUK) {
      // UK: "City, Region" or just "City" — omit country
      if (city && stage) return `${city}, ${stage}`
      if (city) return city
      if (stage) return stage
      return 'United Kingdom'
    }

    // International: "City, Country"
    const parts: string[] = []
    if (city) parts.push(city)
    if (stage && stage !== city && stage !== country) parts.push(stage)
    if (country) parts.push(country)
    return parts.join(', ')
  }

  // Fallback to raw location field
  if (loc.location) {
    const raw = loc.location.trim()
    // Skip junk entries (single chars, PHP serialization fragments)
    if (raw.length <= 1 || /^[{};:"\d]$/.test(raw)) return ''
    // Clean up trailing quotes/semicolons from bad migration
    return raw.replace(/[";]+$/, '').trim()
  }

  return ''
}

/** Format multiple locations into a display string */
export function formatLocations(locations: Array<{
  location?: string | null
  city?: string | null
  stage?: string | null
  country?: string | null
}>): string {
  return locations
    .map(formatLocation)
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i) // deduplicate
    .join(' · ')
}

/**
 * Parse PHP serialized data and extract string values.
 * Handles common patterns from WordPress meta fields:
 *   a:1:{i:0;s:46:"10100 Santa Monica Blvd, Los Angeles, CA 90067";}
 *   s:15:"info@example.com";
 * Returns an array of extracted string values.
 */
export function parsePhpSerialized(raw: any): string[] {
  if (!raw) return []

  // If it's already an array, try to parse each element
  if (Array.isArray(raw)) {
    const results: string[] = []
    for (const item of raw) {
      if (typeof item === 'string') {
        // Check if this array element is itself PHP-serialized
        if (item.includes(':{') || item.startsWith('a:') || item.startsWith('s:')) {
          const parsed = parsePhpSerialized(item)
          results.push(...parsed)
        } else if (item.trim()) {
          results.push(item.trim())
        }
      }
    }
    return results
  }

  if (typeof raw !== 'string') return []

  // If it's already a clean value (no PHP serialization markers), return as-is
  if (!raw.includes(':{') && !raw.startsWith('a:') && !raw.startsWith('s:')) {
    return raw.trim() ? [raw.trim()] : []
  }

  const results: string[] = []
  // Match all s:N:"value"; patterns
  const regex = /s:\d+:"(.*?)";/g
  let match
  while ((match = regex.exec(raw)) !== null) {
    const val = match[1].trim()
    if (val) results.push(val)
  }
  return results
}

/**
 * Parse a PHP serialized field and return the first non-empty value, or null.
 */
export function parsePhpSerializedFirst(raw: string | null | undefined): string | null {
  const vals = parsePhpSerialized(raw)
  return vals.length > 0 ? vals[0] : null
}

/** Strip HTML and return plain text */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Generate excerpt from HTML content */
export function generateExcerpt(content: string | null, maxLen = 180): string {
  if (!content) return ''
  const plain = stripHtml(content)
  if (plain.length <= maxLen) return plain
  return plain.substring(0, maxLen).replace(/\s+\S*$/, '') + '...'
}

/** Estimate read time from HTML content */
export function estimateReadTime(content: string | null): number {
  if (!content) return 1
  const words = stripHtml(content).split(/\s+/).length
  return Math.max(1, Math.round(words / 225))
}

/** Format date as relative time (e.g. "2 hours ago", "3 days ago") or fallback to formatted date */
export function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(iso)
}

/** Pagination helper */
export function getPaginationRange(current: number, total: number, perPage: number) {
  const totalPages = Math.ceil(total / perPage)
  const delta = 2
  const range: number[] = []

  for (let i = Math.max(2, current - delta); i <= Math.min(totalPages - 1, current + delta); i++) {
    range.push(i)
  }

  if (current - delta > 2) range.unshift(-1) // ellipsis
  if (current + delta < totalPages - 1) range.push(-1) // ellipsis

  range.unshift(1)
  if (totalPages > 1) range.push(totalPages)

  return { range, totalPages }
}
