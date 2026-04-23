/**
 * Domain-match auto-linking between crew members and companies.
 *
 * The signal: when a crew member's professional email shares a domain with a
 * company's website / corporate email (e.g. john@acmefilms.com ↔
 * acmefilms.com), they almost certainly work there. Wire those rows together
 * via the company_staff junction so users see "Staff" on the company page and
 * "Companies" on the crew page without an admin manually doing it.
 *
 * Trigger points:
 *  • After AI enrichment writes a new email/website (see ai-research/apply route)
 *  • Future: a one-shot admin "Re-scan all links" backfill button
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { parsePhpSerialized } from '@/lib/utils'

// Personal mailbox providers — never use these as a "this person works here" signal.
// Keep this list tight. False positives here would link unrelated crew to random companies.
const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.ca', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'hotmail.co.uk', 'hotmail.ca',
  'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'aim.com',
  'protonmail.com', 'proton.me', 'pm.me',
  'comcast.net', 'sbcglobal.net', 'verizon.net', 'att.net', 'cox.net',
  'mail.com', 'gmx.com', 'gmx.net',
  'fastmail.com', 'fastmail.fm',
  'zoho.com',
  'yandex.com', 'yandex.ru',
])

export function extractEmailDomain(email: string | null | undefined): string | null {
  if (!email) return null
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at < 1 || at === trimmed.length - 1) return null
  const domain = trimmed.slice(at + 1).replace(/[>\s,;].*$/, '').trim()
  if (!domain.includes('.')) return null
  return domain
}

/**
 * Pull a normalized domain out of a website URL or bare hostname.
 *   "https://www.acmefilms.com/about" → "acmefilms.com"
 *   "Acmefilms.com" → "acmefilms.com"
 */
export function extractWebsiteDomain(url: string | null | undefined): string | null {
  if (!url) return null
  let s = url.trim().toLowerCase()
  if (!s) return null
  // Strip scheme
  s = s.replace(/^https?:\/\//, '')
  // Strip path/query/fragment
  s = s.split('/')[0].split('?')[0].split('#')[0]
  // Strip leading www.
  s = s.replace(/^www\./, '')
  // Strip trailing port
  s = s.replace(/:\d+$/, '')
  if (!s.includes('.')) return null
  return s
}

export function isGenericEmailDomain(domain: string | null | undefined): boolean {
  if (!domain) return true
  return GENERIC_EMAIL_DOMAINS.has(domain.toLowerCase())
}

/**
 * Extract every "real" company-style email domain from a value that may be
 * either a single email string or an array of emails (raw or PHP-serialized).
 */
export function collectEmailDomains(value: unknown): string[] {
  const raw: string[] = []
  if (Array.isArray(value)) {
    for (const v of parsePhpSerialized(value as any)) raw.push(String(v))
  } else if (typeof value === 'string') {
    raw.push(value)
  }
  const domains = new Set<string>()
  for (const r of raw) {
    const d = extractEmailDomain(r)
    if (d && !isGenericEmailDomain(d)) domains.add(d)
  }
  return Array.from(domains)
}

interface CompanyMatch { id: number; title: string; via: 'website' | 'email' }
interface CrewMatch    { id: number; name:  string; via: 'email' }

/**
 * Find a company whose website or corporate email matches `domain`.
 * Prefers website match (stronger signal) over email match.
 * Returns at most one — if multiple match, pick the one with the smallest id
 * (oldest/canonical record) to keep behavior stable.
 */
export async function findCompanyByDomain(
  supabase: SupabaseClient,
  domain: string,
): Promise<CompanyMatch | null> {
  if (isGenericEmailDomain(domain)) return null

  // Website match — covers both bare-domain and "https://www.domain.com/about" stored values.
  const { data: byWebsite } = await supabase
    .from('companies')
    .select('id, title, website')
    .ilike('website', `%${domain}%`)
    .order('id', { ascending: true })
    .limit(5)

  for (const row of byWebsite ?? []) {
    if (extractWebsiteDomain((row as any).website) === domain) {
      return { id: (row as any).id, title: (row as any).title, via: 'website' }
    }
  }

  // Email match — the company has a corporate email at this domain.
  // PostgREST can't ilike-into a text[] element, so fetch candidates whose
  // serialized array string contains the domain and verify in JS.
  const { data: candidates } = await supabase
    .from('companies')
    .select('id, title, emails')
    .filter('emails', 'cs', `{${domain}}`)  // best-effort prefilter; may match nothing — fallback below
    .limit(20)

  // If the cs (contains) filter found nothing, do a broader text-array fallback.
  let pool: any[] = candidates ?? []
  if (pool.length === 0) {
    const { data: broader } = await supabase
      .from('companies')
      .select('id, title, emails')
      .not('emails', 'is', null)
      .limit(2000)  // safety cap
    pool = broader ?? []
  }

  for (const row of pool) {
    const domains = collectEmailDomains((row as any).emails)
    if (domains.includes(domain)) {
      return { id: (row as any).id, title: (row as any).title, via: 'email' }
    }
  }

  return null
}

/**
 * Find all crew members whose emails are at `domain`.
 * Used when a company's website/email is enriched and we want to back-link
 * any existing crew that already had the matching email.
 */
export async function findCrewByDomain(
  supabase: SupabaseClient,
  domain: string,
): Promise<CrewMatch[]> {
  if (isGenericEmailDomain(domain)) return []

  // Same shape problem as above — PostgREST array ilike isn't directly available.
  // Fetch a bounded pool of crew with non-null emails, then filter in JS.
  const { data: pool } = await supabase
    .from('crew_members')
    .select('id, name, emails')
    .not('emails', 'is', null)
    .limit(5000)  // safety cap

  const matches: CrewMatch[] = []
  for (const row of pool ?? []) {
    const domains = collectEmailDomains((row as any).emails)
    if (domains.includes(domain)) {
      matches.push({ id: (row as any).id, name: (row as any).name, via: 'email' })
    }
  }
  return matches
}

/**
 * Insert a (company_id, crew_id) row in company_staff if it doesn't already
 * exist. Returns true if a new link was created.
 */
export async function linkCrewToCompany(
  supabase: SupabaseClient,
  companyId: number,
  crewId: number,
  position: string | null = null,
): Promise<boolean> {
  // Already linked? Skip silently.
  const { data: existing } = await supabase
    .from('company_staff')
    .select('id')
    .eq('company_id', companyId)
    .eq('crew_id', crewId)
    .limit(1)
  if (existing && existing.length > 0) return false

  const { error } = await supabase
    .from('company_staff')
    .insert({ company_id: companyId, crew_id: crewId, position, sort_order: 999 })
  if (error) {
    console.warn(`[crew-company-matcher] Failed to link crew=${crewId} → company=${companyId}:`, error.message)
    return false
  }
  return true
}
