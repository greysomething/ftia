/**
 * GET /api/cron/discovery-poll
 *
 * Fetches every enabled discovery_source, parses its feed, and inserts any
 * NEW items (deduped by source_id + external_id) with status='new'.
 *
 * Admin can also POST to /api/admin/discovery/poll for a manual trigger.
 *
 * Protected by CRON_SECRET to prevent unauthorized triggers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchFeed } from '@/lib/discovery/rss-parser'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runPoll()
}

// Allow POST for the admin-triggered manual call (gated separately by requireAdmin)
export async function POST() {
  return runPoll()
}

async function runPoll() {
  const supabase = createAdminClient()

  // Check master enable flag
  const { data: settingsRows } = await supabase
    .from('discovery_settings').select('key, value').eq('key', 'enabled')
  if (settingsRows?.[0]?.value === 'false') {
    return NextResponse.json({ ok: true, skipped: 'discovery disabled in settings' })
  }

  const { data: sources, error } = await supabase
    .from('discovery_sources').select('*').eq('enabled', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sources || sources.length === 0) {
    return NextResponse.json({ ok: true, message: 'No enabled sources.' })
  }

  const results: any[] = []
  for (const source of sources) {
    try {
      const items = await fetchFeed(source.url, 30)
      let inserted = 0
      let skipped = 0

      for (const item of items) {
        // Upsert: insert if new, ignore conflicts (we already have it)
        const { error: insErr, count } = await supabase
          .from('discovery_items')
          .upsert({
            source_id: source.id,
            external_id: item.external_id,
            title: item.title,
            link: item.link,
            summary: item.summary,
            published_at: item.published_at,
            raw_data: item.raw_data,
            status: 'new',
          }, { onConflict: 'source_id,external_id', ignoreDuplicates: true, count: 'exact' })

        if (insErr) {
          // Hard error — count it
          skipped++
          continue
        }
        if ((count ?? 0) > 0) inserted++
        else skipped++
      }

      await supabase.from('discovery_sources').update({
        last_polled_at: new Date().toISOString(),
        last_error: null,
        success_count: (source.success_count ?? 0) + 1,
      }).eq('id', source.id)

      results.push({ source: source.name, fetched: items.length, inserted, already_seen: skipped })
    } catch (err: any) {
      const message = err.message?.slice(0, 500) ?? 'Unknown error'
      await supabase.from('discovery_sources').update({
        last_polled_at: new Date().toISOString(),
        last_error: message,
        failure_count: (source.failure_count ?? 0) + 1,
      }).eq('id', source.id)
      results.push({ source: source.name, error: message })
    }
  }

  const totalInserted = results.reduce((sum, r) => sum + (r.inserted ?? 0), 0)
  return NextResponse.json({
    ok: true,
    sources_polled: sources.length,
    new_items: totalInserted,
    results,
  })
}
