/**
 * POST /api/admin/discovery/redecode
 *
 * One-shot cleanup: re-runs HTML entity decoding on the title and summary of
 * every discovery_item that contains an unresolved entity (e.g. &#8217;,
 * &amp;, &nbsp;). Used to fix items polled before the decoder bug fix.
 */

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { decodeHtmlEntities } from '@/lib/discovery/rss-parser'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ENTITY_RE = /&(#\d+|#x[0-9a-fA-F]+|amp|lt|gt|quot|apos|nbsp|ldquo|rdquo|lsquo|rsquo|hellip|mdash|ndash);/

export async function POST() {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Pull all items in batches of 1000 — entity-affected rows usually number
  // in the dozens but we don't want to assume.
  let updated = 0
  let scanned = 0
  let from = 0
  while (true) {
    const { data: items, error } = await supabase
      .from('discovery_items')
      .select('id, title, summary')
      .range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!items || items.length === 0) break

    for (const item of items) {
      scanned++
      const oldTitle = String(item.title ?? '')
      const oldSummary = item.summary ? String(item.summary) : null
      const needsTitle = ENTITY_RE.test(oldTitle)
      const needsSummary = oldSummary != null && ENTITY_RE.test(oldSummary)
      if (!needsTitle && !needsSummary) continue

      const patch: Record<string, any> = {}
      if (needsTitle) patch.title = decodeHtmlEntities(oldTitle)
      if (needsSummary && oldSummary != null) patch.summary = decodeHtmlEntities(oldSummary)
      await supabase.from('discovery_items').update(patch).eq('id', item.id)
      updated++
    }
    if (items.length < 1000) break
    from += 1000
  }

  return NextResponse.json({ ok: true, scanned, updated })
}
