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

  const q = req.nextUrl.searchParams.get('q')?.trim()
  const type = req.nextUrl.searchParams.get('type') // 'company' or 'crew'

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const supabase = createAdminClient()
  const pattern = `%${q}%`

  if (type === 'company') {
    const { data } = await supabase
      .from('companies')
      .select('id, title, slug, addresses, phones, emails')
      .ilike('title', pattern)
      .eq('visibility', 'publish')
      .order('title')
      .limit(8)

    const results = (data ?? []).map(co => ({
      id: co.id,
      title: co.title,
      slug: co.slug,
      detail: buildDetail(co.addresses as string[], co.phones as string[], co.emails as string[]),
    }))

    return NextResponse.json({ results })
  }

  if (type === 'crew') {
    const { data } = await supabase
      .from('crew_members')
      .select('id, name, slug, emails, phones')
      .ilike('name', pattern)
      .eq('visibility', 'publish')
      .order('name')
      .limit(8)

    const results = (data ?? []).map(cm => ({
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
