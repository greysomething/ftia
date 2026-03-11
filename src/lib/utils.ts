import type { ProductionPhase } from '@/types/database'

export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ')
}

/** Format YYYYMMDD or ISO date string to "Month YYYY" */
export function formatProductionDate(raw: string | null | undefined): string {
  if (!raw) return 'TBA'
  // Handle YYYYMMDD (WP format)
  if (/^\d{8}$/.test(raw)) {
    const year = raw.slice(0, 4)
    const month = parseInt(raw.slice(4, 6), 10) - 1
    const d = new Date(parseInt(year), month, 1)
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  const d = new Date(raw)
  if (isNaN(d.getTime())) return 'TBA'
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** Format ISO date to "Jan 15, 2024" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
  if (storagePath) {
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${storagePath}`
  }
  return originalUrl ?? '/images/placeholder.jpg'
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
