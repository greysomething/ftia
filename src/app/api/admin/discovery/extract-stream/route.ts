/**
 * POST /api/admin/discovery/extract-stream
 * Body: { limit?: number; ids?: number[] }
 *
 * Streaming version of the batch extractor. Emits SSE events as each item
 * progresses through dedup → extraction → draft creation, so the admin UI
 * can show live progress, current item title, scores, and errors.
 *
 * Events:
 *   { type: 'start',    total }
 *   { type: 'processing', id, title, index }
 *   { type: 'item',     id, title, status, score?, productionId?, error?, index }
 *   { type: 'done',     processed, created, extracted, duplicates, filtered, errors, dailyCapRemaining }
 */

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { extractProductionFromArticle } from '@/lib/discovery/extractor'
import { findBestMatch, loadProductionTitles } from '@/lib/discovery/title-normalize'
import { createDraftFromExtraction } from '@/lib/discovery/draft-creator'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  const apiKey = process.env.SCANNER_ANTHROPIC_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'SCANNER_ANTHROPIC_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: { limit?: number; ids?: number[] } = {}
  try { body = await req.json() } catch { /* empty body OK */ }
  const requestedLimit = body.limit
  const explicitIds = Array.isArray(body.ids) ? body.ids.filter(n => Number.isFinite(n)) : null

  const supabase = createAdminClient()

  // Settings
  const { data: settingsRows } = await supabase.from('discovery_settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const s of settingsRows ?? []) settings[s.key] = s.value

  if (settings.enabled === 'false' || settings.extraction_enabled === 'false') {
    return new Response(JSON.stringify({ error: 'Extraction disabled in settings' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const batchSize = requestedLimit ?? Math.max(1, Math.min(20, parseInt(settings.extraction_batch_size || '5', 10)))
  const dailyCap = Math.max(1, parseInt(settings.extraction_daily_cap || '30', 10))
  const threshold = Math.max(0, Math.min(100, parseInt(settings.extraction_threshold || '85', 10)))
  const dedupThreshold = Math.max(0, Math.min(100, parseInt(settings.dedup_threshold || '85', 10)))

  // Daily cap (UTC)
  const startOfUtcDay = new Date()
  startOfUtcDay.setUTCHours(0, 0, 0, 0)
  const { count: processedToday } = await supabase
    .from('discovery_items')
    .select('*', { count: 'exact', head: true })
    .gte('processed_at', startOfUtcDay.toISOString())
    .in('status', ['extracted', 'created', 'duplicate', 'error', 'filtered_out'])
  const remainingToday = Math.max(0, dailyCap - (processedToday ?? 0))

  if (remainingToday === 0) {
    return new Response(JSON.stringify({ error: `Daily cap of ${dailyCap} reached` }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Pull items: explicit ids > pending ('new')
  let items: any[] = []
  if (explicitIds && explicitIds.length > 0) {
    const { data } = await supabase.from('discovery_items')
      .select('*').in('id', explicitIds.slice(0, Math.min(explicitIds.length, remainingToday)))
    items = data ?? []
  } else {
    const effective = Math.min(batchSize, remainingToday)
    const { data } = await supabase.from('discovery_items')
      .select('*').eq('status', 'new')
      .order('created_at', { ascending: true })
      .limit(effective)
    items = data ?? []
  }

  if (items.length === 0) {
    return new Response(JSON.stringify({ error: 'No items to process' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Pre-load every production (paginated, since Supabase caps single requests
  // at 1000 rows). Without this we'd silently miss any duplicate older than
  // the newest 1000 productions.
  const candidates = await loadProductionTitles(supabase)

  // Stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)) } catch { /* closed */ }
      }
      send({ type: 'start', total: items.length, threshold, dailyCapRemaining: remainingToday })

      let created = 0
      let extracted = 0
      let duplicates = 0
      let filtered = 0
      let errors = 0

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const index = i + 1
        send({ type: 'processing', id: item.id, title: item.title, index })

        // Pre-extraction dedup check
        const match = findBestMatch(item.title, candidates, dedupThreshold)
        if (match) {
          await supabase.from('discovery_items').update({
            status: 'duplicate',
            duplicate_of: match.id,
            processed_at: new Date().toISOString(),
            error: `Matched existing production #${match.id} "${match.title}" at ${Math.round(match.score * 100)}%`,
          }).eq('id', item.id)
          duplicates++
          send({ type: 'item', id: item.id, title: item.title, status: 'duplicate', match: match.id, matchTitle: match.title, matchScore: Math.round(match.score * 100), index })
          continue
        }

        await supabase.from('discovery_items').update({ status: 'extracting' }).eq('id', item.id)

        try {
          const ext = await extractProductionFromArticle(apiKey, {
            title: item.title, link: item.link, summary: item.summary,
          })

          if (!ext) {
            await supabase.from('discovery_items').update({
              status: 'filtered_out', processed_at: new Date().toISOString(),
            }).eq('id', item.id)
            filtered++
            send({ type: 'item', id: item.id, title: item.title, status: 'filtered_out', index })
            continue
          }

          // Re-dedup against the extracted (canonical) title
          const reMatch = findBestMatch(ext.title, candidates, dedupThreshold)
          if (reMatch) {
            await supabase.from('discovery_items').update({
              status: 'duplicate',
              duplicate_of: reMatch.id,
              extraction_score: ext.verifiability_score,
              extraction_data: ext,
              processed_at: new Date().toISOString(),
              error: `Extracted title matched existing production #${reMatch.id} "${reMatch.title}" at ${Math.round(reMatch.score * 100)}%`,
            }).eq('id', item.id)
            duplicates++
            send({ type: 'item', id: item.id, title: ext.title, status: 'duplicate', match: reMatch.id, matchTitle: reMatch.title, matchScore: Math.round(reMatch.score * 100), score: ext.verifiability_score, index })
            continue
          }

          if (ext.verifiability_score >= threshold) {
            const sourceRow = await supabase.from('discovery_sources').select('name').eq('id', item.source_id).maybeSingle()
            const result = await createDraftFromExtraction(supabase, ext, {
              sourceLink: item.link, sourceName: sourceRow.data?.name ?? null,
            })
            if (!result.isNew) {
              // Slug-collision backstop fired — an existing production already
              // has this slug. Treat as duplicate.
              await supabase.from('discovery_items').update({
                status: 'duplicate',
                duplicate_of: result.duplicateOfId,
                extraction_score: ext.verifiability_score,
                extraction_data: ext,
                processed_at: new Date().toISOString(),
                error: `Slug match: existing production #${result.duplicateOfId} "${result.existingTitle}" has the same slug`,
              }).eq('id', item.id)
              duplicates++
              send({ type: 'item', id: item.id, title: ext.title, status: 'duplicate', match: result.duplicateOfId, matchTitle: result.existingTitle, matchScore: 100, score: ext.verifiability_score, index })
            } else {
              await supabase.from('discovery_items').update({
                status: 'created',
                production_id: result.productionId,
                extraction_score: ext.verifiability_score,
                extraction_data: ext,
                processed_at: new Date().toISOString(),
              }).eq('id', item.id)
              candidates.unshift({ id: result.productionId, title: ext.title })
              created++
              send({ type: 'item', id: item.id, title: ext.title, status: 'created', score: ext.verifiability_score, productionId: result.productionId, index })
            }
          } else {
            await supabase.from('discovery_items').update({
              status: 'extracted',
              extraction_score: ext.verifiability_score,
              extraction_data: ext,
              processed_at: new Date().toISOString(),
            }).eq('id', item.id)
            extracted++
            send({ type: 'item', id: item.id, title: ext.title, status: 'extracted', score: ext.verifiability_score, index })
          }
        } catch (err: any) {
          await supabase.from('discovery_items').update({
            status: 'error', error: err.message?.slice(0, 500), processed_at: new Date().toISOString(),
          }).eq('id', item.id)
          errors++
          send({ type: 'item', id: item.id, title: item.title, status: 'error', error: err.message?.slice(0, 200), index })
        }

        await new Promise(r => setTimeout(r, 300))
      }

      send({
        type: 'done',
        processed: items.length,
        created, extracted, duplicates, filtered, errors,
        dailyCapRemaining: Math.max(0, remainingToday - items.length),
        threshold,
      })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
