/**
 * Pacific Time helpers for datetime-local form inputs.
 *
 * All blog scheduling/publishing dates are authored in Pacific Time regardless
 * of who is editing them or where the server is running. These helpers convert
 * between the naive "YYYY-MM-DDTHH:MM" string the browser's datetime-local
 * input uses and real UTC ISO timestamps for storage.
 *
 * Handles PST (UTC-8) and PDT (UTC-7) automatically via Intl.
 */

export const PACIFIC_TZ = 'America/Los_Angeles'

/**
 * Given a UTC Date or ISO string, compute the offset in minutes that Pacific
 * Time is behind UTC at that moment (positive for PT = UTC-X).
 * PDT (summer) = 420, PST (winter) = 480.
 */
export function pacificOffsetMinutes(at: Date | string): number {
  const date = typeof at === 'string' ? new Date(at) : at
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts: Record<string, string> = {}
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value
  // "2-digit" sometimes yields "24" for midnight in formatToParts — normalize
  const hour = parts.hour === '24' ? '00' : parts.hour
  const asIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(hour), Number(parts.minute), Number(parts.second ?? '0'),
  )
  return Math.round((date.getTime() - asIfUtc) / 60000)
}

/**
 * Convert a datetime-local string ("YYYY-MM-DDTHH:MM") that is assumed to be
 * in Pacific Time into a UTC ISO string for storage.
 *
 * Example: ptLocalStringToUtcIso("2026-04-21T09:00") → "2026-04-21T16:00:00.000Z"
 *          (April in PDT = UTC-7)
 */
export function ptLocalStringToUtcIso(localStr: string): string {
  if (!localStr) return ''
  // Add ":00" seconds if missing so the UTC parser accepts it
  const withSeconds = /:\d{2}:\d{2}$/.test(localStr) ? localStr : `${localStr}:00`
  // Parse as if the string were UTC — this gives us a reference point.
  const asUtc = new Date(`${withSeconds}Z`)
  if (isNaN(asUtc.getTime())) return ''
  // Find the PT offset for that moment and shift.
  const offsetMin = pacificOffsetMinutes(asUtc)
  // offsetMin is positive (e.g. 420 for PDT). Real UTC = asUtc + offsetMin minutes.
  return new Date(asUtc.getTime() + offsetMin * 60000).toISOString()
}

/**
 * Convert a Date or UTC ISO string into a datetime-local input string
 * ("YYYY-MM-DDTHH:MM") formatted in Pacific Time, regardless of the browser's
 * local timezone.
 */
export function utcToPtLocalString(dateInput: Date | string): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (!d || isNaN(d.getTime())) return ''
  const parts: Record<string, string> = {}
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)) parts[p.type] = p.value
  const hour = parts.hour === '24' ? '00' : parts.hour
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`
}
