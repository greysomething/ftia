import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Extracts clean string values from a PHP serialized string.
 * Input:  'a:1:{i:0;s:55:"1640 S Sepulveda Blvd, Suite 450, Los Angeles, CA 90025";}'
 * Output: '1640 S Sepulveda Blvd, Suite 450, Los Angeles, CA 90025'
 */
function extractFromPhp(raw: string): string {
  if (!raw || typeof raw !== 'string') return raw
  // If it doesn't look like PHP serialized data, return as-is
  if (!raw.includes(':{') && !raw.startsWith('a:') && !raw.startsWith('s:')) return raw.trim()
  // Extract all s:N:"value"; patterns
  const results: string[] = []
  const regex = /s:\d+:"((?:[^"\\]|\\.)*)";/g
  let match
  while ((match = regex.exec(raw)) !== null) {
    const val = match[1].trim()
    if (val) results.push(val)
  }
  return results.join(', ') || raw.trim()
}

/**
 * Format a US phone number to (xxx) xxx-xxxx format.
 */
function fmtPhone(phone: string): string {
  if (!phone) return ''
  const cleaned = phone.replace(/[^\d+]/g, '')
  const usMatch = cleaned.match(/^(?:\+?1)?(\d{3})(\d{3})(\d{4})$/)
  if (usMatch) return `(${usMatch[1]}) ${usMatch[2]}-${usMatch[3]}`
  const localMatch = cleaned.match(/^(\d{3})(\d{4})$/)
  if (localMatch) return `${localMatch[1]}-${localMatch[2]}`
  if (/[\(\)\-\s]/.test(phone) && /\d/.test(phone)) return phone.trim()
  return phone.trim()
}

/**
 * Clean a JSONB array of possibly PHP-serialized strings.
 * Returns a clean array of parsed values.
 */
function cleanArray(arr: any, isPhone = false): string[] {
  if (!arr) return []
  if (!Array.isArray(arr)) return []
  const results: string[] = []
  for (const item of arr) {
    if (typeof item !== 'string') continue
    const clean = extractFromPhp(item)
    if (clean) {
      results.push(isPhone ? fmtPhone(clean) : clean)
    }
  }
  return results
}

function needsCleaning(arr: any): boolean {
  if (!Array.isArray(arr)) return false
  return arr.some((item: any) =>
    typeof item === 'string' && (item.includes(':{') || item.startsWith('a:') || item.startsWith('s:'))
  )
}

/**
 * POST /api/admin/clean-php-data
 * Bulk-cleans PHP serialized data from companies and crew_members tables.
 * Also cleans production_company_links inline data.
 */
export async function POST() {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  let companiesCleaned = 0
  let crewCleaned = 0
  let linksCleaned = 0

  // ── Clean companies ─────────────────────────────────────────
  const { data: companies } = await supabase
    .from('companies')
    .select('id, addresses, phones, faxes, emails')

  if (companies) {
    for (const c of companies) {
      const dirtyAddr = needsCleaning(c.addresses)
      const dirtyPhone = needsCleaning(c.phones)
      const dirtyFax = needsCleaning(c.faxes)
      const dirtyEmail = needsCleaning(c.emails)

      if (dirtyAddr || dirtyPhone || dirtyFax || dirtyEmail) {
        const update: Record<string, any> = {}
        if (dirtyAddr) update.addresses = cleanArray(c.addresses)
        if (dirtyPhone) update.phones = cleanArray(c.phones, true)
        if (dirtyFax) update.faxes = cleanArray(c.faxes, true)
        if (dirtyEmail) update.emails = cleanArray(c.emails)

        await supabase.from('companies').update(update).eq('id', c.id)
        companiesCleaned++
      }
    }
  }

  // ── Clean crew_members ──────────────────────────────────────
  const { data: crew } = await supabase
    .from('crew_members')
    .select('id, emails, phones')

  if (crew) {
    for (const c of crew) {
      const dirtyPhone = needsCleaning(c.phones)
      const dirtyEmail = needsCleaning(c.emails)

      if (dirtyPhone || dirtyEmail) {
        const update: Record<string, any> = {}
        if (dirtyPhone) update.phones = cleanArray(c.phones, true)
        if (dirtyEmail) update.emails = cleanArray(c.emails)

        await supabase.from('crew_members').update(update).eq('id', c.id)
        crewCleaned++
      }
    }
  }

  // ── Clean production_company_links inline fields ─────────────
  const { data: links } = await supabase
    .from('production_company_links')
    .select('id, inline_address, inline_phones, inline_faxes, inline_emails')

  if (links) {
    for (const l of links) {
      const dirtyAddr = typeof l.inline_address === 'string' &&
        (l.inline_address.includes(':{') || l.inline_address.startsWith('a:') || l.inline_address.startsWith('s:'))
      const dirtyPhone = needsCleaning(l.inline_phones)
      const dirtyFax = needsCleaning(l.inline_faxes)
      const dirtyEmail = needsCleaning(l.inline_emails)

      if (dirtyAddr || dirtyPhone || dirtyFax || dirtyEmail) {
        const update: Record<string, any> = {}
        if (dirtyAddr) update.inline_address = extractFromPhp(l.inline_address)
        if (dirtyPhone) update.inline_phones = cleanArray(l.inline_phones, true)
        if (dirtyFax) update.inline_faxes = cleanArray(l.inline_faxes, true)
        if (dirtyEmail) update.inline_emails = cleanArray(l.inline_emails)

        await supabase.from('production_company_links').update(update).eq('id', l.id)
        linksCleaned++
      }
    }
  }

  return NextResponse.json({
    ok: true,
    companiesCleaned,
    crewCleaned,
    linksCleaned,
    message: `Cleaned ${companiesCleaned} companies, ${crewCleaned} crew members, ${linksCleaned} production links.`,
  })
}
