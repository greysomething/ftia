import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { cleanPgArray } from '@/lib/php-unserialize'

export const dynamic = 'force-dynamic'

/**
 * Lightweight typeahead search for companies or crew members.
 * GET /api/admin/search-entities?q=CBS&type=company
 * GET /api/admin/search-entities?q=Jonathan&type=crew
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // A trailing space in the query is treated as a *word boundary* hint:
  //   "Vice"  → substring match (matches "Service", "Advice", "Vice Media", …)
  //   "Vice " → whole-word match  (matches "Vice", "Vice Media", but NOT "Service" or "Advice")
  // This lets admins disambiguate short generic terms by adding a trailing space.
  const rawQ = req.nextUrl.searchParams.get('q') ?? ''
  const type = req.nextUrl.searchParams.get('type') // 'company' or 'crew'
  const wholeWord = rawQ.endsWith(' ')
  const q = rawQ.trim()

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const supabase = createAdminClient()
  const pattern = `%${q}%`
  // Postgres POSIX word-boundary regex: \m = start of word, \M = end of word.
  // Escape any regex metacharacters in the search term so user input is treated literally.
  const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const wordPattern = `\\m${escapedQ}\\M`

  if (type === 'company') {
    let query = supabase
      .from('companies')
      .select('id, title, slug, addresses, phones, emails')
      .eq('visibility', 'publish')
      .order('title')
      .limit(8)
    query = wholeWord
      ? query.filter('title', 'imatch', wordPattern)
      : query.ilike('title', pattern)
    const { data } = await query

    const results = (data ?? []).map((co: any) => ({
      id: co.id,
      title: co.title,
      slug: co.slug,
      detail: buildDetail(co.addresses as string[], co.phones as string[], co.emails as string[]),
    }))

    return NextResponse.json({ results })
  }

  if (type === 'crew') {
    let query = supabase
      .from('crew_members')
      .select('id, name, slug, emails, phones')
      .eq('visibility', 'publish')
      .order('name')
      .limit(8)
    query = wholeWord
      ? query.filter('name', 'imatch', wordPattern)
      : query.ilike('name', pattern)
    const { data } = await query

    const results = (data ?? []).map((cm: any) => ({
      id: cm.id,
      title: cm.name,
      slug: cm.slug,
      detail: buildDetail([], cm.phones as string[], cm.emails as string[]),
    }))

    return NextResponse.json({ results })
  }

  return NextResponse.json({ results: [] })
}

function buildDetail(
  addresses: string[] = [],
  phones: string[] = [],
  emails: string[] = [],
): string {
  const parts: string[] = []

  const cleanAddrs = cleanPgArray(addresses)
  if (cleanAddrs[0]) parts.push(cleanAddrs[0].length > 50 ? cleanAddrs[0].slice(0, 47) + '...' : cleanAddrs[0])

  const cleanPhones = cleanPgArray(phones)
  if (cleanPhones[0]) parts.push(cleanPhones[0])

  const cleanEmails = cleanPgArray(emails)
  if (cleanEmails[0]) parts.push(cleanEmails[0])

  return parts.join(' | ')
}
