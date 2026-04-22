/**
 * GET /api/cron/discovery-extract
 *
 * Processes a batch of pending discovery_items: extract structured production
 * data with Claude+web-search, dedup against existing productions, and
 * auto-create drafts when verifiability score ≥ threshold.
 *
 * Throttled by:
 *   - extraction_batch_size (per run, default 5)
 *   - extraction_daily_cap  (per UTC day, default 30)
 *
 * Protected by CRON_SECRET; admins can also POST manually for one-off triggers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { extractProductionFromArticle } from '@/lib/discovery/extractor'
import { findBestMatch } from '@/lib/discovery/title-normalize'
import { createDraftFromExtraction } from '@/lib/discovery/draft-creator'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runExtract({ source: 'cron' })
}

export async function POST(req: NextRequest) {
  // Admin-triggered (gated by requireAdmin in the wrapping admin endpoint that calls this internally,
  // but we accept direct POST here too — the rate caps protect against abuse).
  let limit: number | undefined
  try { const body = await req.json(); limit = body?.limit } catch { /* empty */ }
  return runExtract({ source: 'manual', forcedLimit: limit })
}

async function runExtract(opts: { source: 'cron' | 'manual'; forcedLimit?: number } = { source: 'cron' }) {
  const apiKey = process.env.SCANNER_ANTHROPIC_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'SCANNER_ANTHROPIC_KEY not configured' }, { status: 500 })
  }

  const supabase = createAdminClient()

  // Read settings
  const { data: settingsRows } = await supabase.from('discovery_settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const s of settingsRows ?? []) settings[s.key] = s.value

  if (settings.enabled === 'false' || settings.extraction_enabled === 'false') {
    return NextResponse.json({ ok: true, skipped: 'extraction disabled' })
  }

  const batchSize = opts.forcedLimit ?? Math.max(1, Math.min(20, parseInt(settings.extraction_batch_size || '5', 10)))
  const dailyCap = Math.max(1, parseInt(settings.extraction_daily_cap || '30', 10))
  const threshold = Math.max(0, Math.min(100, parseInt(settings.extraction_threshold || '85', 10)))
  const dedupThreshold = Math.max(0, Math.min(100, parseInt(settings.dedup_threshold || '85', 10)))

  // Daily cap check (count items processed today, UTC)
  const startOfUtcDay = new Date()
  startOfUtcDay.setUTCHours(0, 0, 0, 0)
  const { count: processedToday } = await supabase
    .from('discovery_items')
    .select('*', { count: 'exact', head: true })
    .gte('processed_at', startOfUtcDay.toISOString())
    .in('status', ['extracted', 'created', 'duplicate', 'error', 'filtered_out'])

  const remainingToday = Math.max(0, dailyCap - (processedToday ?? 0))
  if (remainingToday === 0) {
    return NextResponse.json({ ok: true, skipped: `daily cap of ${dailyCap} reached` })
  }
  const effectiveBatch = Math.min(batchSize, remainingToday)

  // Pull pending items (oldest first so we don't starve)
  const { data: items, error } = await supabase
    .from('discovery_items')
    .select('*')
    .eq('status', 'new')
    .order('created_at', { ascending: true })
    .limit(effectiveBatch)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items || items.length === 0) {
    return NextResponse.json({ ok: true, message: 'No pending items.', daily_cap_remaining: remainingToday })
  }

  // Pre-load existing production titles for dedup (only published + draft, exclude trash)
  const { data: productions } = await supabase
    .from('productions')
    .select('id, title')
    .neq('visibility', 'trash')
    .order('id', { ascending: false })
    .limit(15000)
  const candidates = (productions ?? []).map((p: any) => ({ id: p.id, title: String(p.title || '') }))

  const results: any[] = []
  for (const item of items) {
    // Title-based dedup BEFORE spending money on extraction
    const match = findBestMatch(item.title, candidates, dedupThreshold)
    if (match) {
      await supabase.from('discovery_items').update({
        status: 'duplicate',
        duplicate_of: match.id,
        processed_at: new Date().toISOString(),
        error: `Matched existing production #${match.id} "${match.title}" at ${Math.round(match.score * 100)}%`,
      }).eq('id', item.id)
      results.push({ id: item.id, title: item.title, status: 'duplicate', match: match.id })
      continue
    }

    // Mark as extracting so concurrent runs don't double-process
    await supabase.from('discovery_items').update({ status: 'extracting' }).eq('id', item.id)

    try {
      const extracted = await extractProductionFromArticle(apiKey, {
        title: item.title, link: item.link, summary: item.summary,
      })

      if (!extracted) {
        // Article isn't a production announcement
        await supabase.from('discovery_items').update({
          status: 'filtered_out',
          processed_at: new Date().toISOString(),
        }).eq('id', item.id)
        results.push({ id: item.id, title: item.title, status: 'filtered_out' })
        continue
      }

      // Re-check dedup against the EXTRACTED title (sometimes article headlines differ)
      const reMatch = findBestMatch(extracted.title, candidates, dedupThreshold)
      if (reMatch) {
        await supabase.from('discovery_items').update({
          status: 'duplicate',
          duplicate_of: reMatch.id,
          extraction_score: extracted.verifiability_score,
          extraction_data: extracted,
          processed_at: new Date().toISOString(),
          error: `Extracted title matched existing production #${reMatch.id} "${reMatch.title}" at ${Math.round(reMatch.score * 100)}%`,
        }).eq('id', item.id)
        results.push({ id: item.id, title: extracted.title, status: 'duplicate', match: reMatch.id })
        continue
      }

      // Score gate
      if (extracted.verifiability_score >= threshold) {
        // Auto-create draft
        const sourceRow = await supabase.from('discovery_sources').select('name').eq('id', item.source_id).maybeSingle()
        const { productionId, slug } = await createDraftFromExtraction(supabase, extracted, {
          sourceLink: item.link, sourceName: sourceRow.data?.name ?? null,
        })
        await supabase.from('discovery_items').update({
          status: 'created',
          production_id: productionId,
          extraction_score: extracted.verifiability_score,
          extraction_data: extracted,
          processed_at: new Date().toISOString(),
        }).eq('id', item.id)
        // Add to candidates immediately so the next item in this batch can dedup against it
        candidates.unshift({ id: productionId, title: extracted.title })
        results.push({ id: item.id, title: extracted.title, status: 'created', production_id: productionId, slug, score: extracted.verifiability_score })
      } else {
        // Below threshold — keep in queue for admin review
        await supabase.from('discovery_items').update({
          status: 'extracted',
          extraction_score: extracted.verifiability_score,
          extraction_data: extracted,
          processed_at: new Date().toISOString(),
        }).eq('id', item.id)
        results.push({ id: item.id, title: extracted.title, status: 'extracted', score: extracted.verifiability_score })
      }
    } catch (err: any) {
      await supabase.from('discovery_items').update({
        status: 'error',
        error: err.message?.slice(0, 500) ?? 'Unknown error',
        processed_at: new Date().toISOString(),
      }).eq('id', item.id)
      results.push({ id: item.id, title: item.title, status: 'error', error: err.message })
    }

    // Light pacing between calls
    await new Promise(r => setTimeout(r, 300))
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    daily_cap_remaining_after: Math.max(0, remainingToday - results.length),
    threshold,
    results,
  })
}
