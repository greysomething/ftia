/**
 * GET /api/cron/enrich-profiles
 *
 * Vercel Cron handler — runs once nightly at 16:00 UTC (= 9am PDT / 8am PST).
 *
 * Flow:
 *   1. Verify CRON_SECRET (no bypass).
 *   2. Read enrichment_config from site_settings.
 *   3. If disabled, return early.
 *   4. Find the worst-scoring published profiles that haven't been enriched
 *      in `min_days_between_runs` days. Cap at `batch_size`.
 *   5. For each candidate: research via web-search → apply high-confidence
 *      fields → log a row to `enrichment_runs`.
 *   6. Prune `enrichment_runs` rows older than 90 days.
 *
 * Auth: REQUIRES `Authorization: Bearer <CRON_SECRET>`. No exceptions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getEnrichmentSettings } from '@/lib/enrichment-settings'
import { findEnrichmentCandidates } from '@/lib/enrichment-queries'
import { researchEntity, applyResearch } from '@/lib/ai-enrichment'

export const dynamic = 'force-dynamic'
// Each AI call can take 30–90 seconds. With batch_size=10 we may need a few minutes.
export const maxDuration = 800

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const supabase = createAdminClient()
  const settings = await getEnrichmentSettings()

  if (!settings.enabled) {
    return NextResponse.json({
      skipped: true,
      reason: 'Enrichment is disabled in admin settings',
      checkedAt: startedAt,
    })
  }

  if (!settings.target_companies && !settings.target_crew) {
    return NextResponse.json({
      skipped: true,
      reason: 'No targets selected (both companies and crew are off)',
      checkedAt: startedAt,
    })
  }

  // Find the candidates
  const candidates = await findEnrichmentCandidates(supabase, {
    batch_size: settings.batch_size,
    target_companies: settings.target_companies,
    target_crew: settings.target_crew,
    min_days_between_runs: settings.min_days_between_runs,
  })

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      message: 'No candidates eligible for enrichment right now.',
      checkedAt: startedAt,
    })
  }

  const results: Array<{
    type: string; id: number; name: string;
    status: 'updated' | 'skipped' | 'error'; fields_updated: number;
    confidence_avg: number | null; error?: string;
  }> = []

  // Process sequentially so we don't blast Anthropic with 10 concurrent web-search calls.
  for (const candidate of candidates) {
    const runStart = new Date().toISOString()
    let status: 'updated' | 'skipped' | 'error' = 'skipped'
    let fieldsUpdated = 0
    let confidenceAvg: number | null = null
    let errorMsg: string | undefined

    try {
      // 1. Pull fresh existing data so the AI prompt knows what NOT to research.
      const table = candidate.type === 'company' ? 'companies' : 'crew_members'
      const { data: existing } = await supabase
        .from(table)
        .select('*')
        .eq('id', candidate.id)
        .single()

      // 2. Research
      const research = await researchEntity(candidate.type, candidate.name, existing)
      if (!research.ok || !research.data) {
        status = 'error'
        errorMsg = research.error ?? 'Research returned no data'
      } else {
        // 3. Apply high-confidence fields
        const apply = await applyResearch(supabase, candidate.type, candidate.id, research.data)
        if (!apply.ok) {
          status = 'error'
          errorMsg = apply.error
        } else if (apply.applied_count > 0) {
          status = 'updated'
          fieldsUpdated = apply.applied_count
          confidenceAvg = apply.confidence_avg
        } else {
          // No fields met confidence threshold OR everything already filled.
          // last_enriched_at WAS stamped, so we won't revisit until the cooldown expires.
          status = 'skipped'
        }
      }
    } catch (err: any) {
      status = 'error'
      errorMsg = err?.message ?? 'Unknown error'
    }

    // 4. Audit log (best-effort — don't let logging failures break the loop)
    try {
      await supabase.from('enrichment_runs').insert({
        started_at: runStart,
        finished_at: new Date().toISOString(),
        entity_type: candidate.type,
        entity_id: candidate.id,
        entity_name: candidate.name,
        fields_updated: fieldsUpdated,
        confidence_avg: confidenceAvg,
        status,
        error: errorMsg ?? null,
        triggered_by: 'cron',
      })
    } catch (logErr) {
      console.warn('[enrich-profiles] audit log insert failed:', logErr)
    }

    results.push({
      type: candidate.type, id: candidate.id, name: candidate.name,
      status, fields_updated: fieldsUpdated, confidence_avg: confidenceAvg, error: errorMsg,
    })
  }

  // 5. Refresh admin caches so newly-enriched rows render fresh values
  revalidatePath('/admin/companies')
  revalidatePath('/admin/crew')
  revalidatePath('/admin/enrichment')

  // 6. Prune old audit rows (keep ~90 days)
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('enrichment_runs').delete().lt('started_at', cutoff)
  } catch (pruneErr) {
    console.warn('[enrich-profiles] prune failed:', pruneErr)
  }

  const summary = {
    ok: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    processed: results.length,
    updated: results.filter(r => r.status === 'updated').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errors: results.filter(r => r.status === 'error').length,
    fields_updated_total: results.reduce((sum, r) => sum + r.fields_updated, 0),
    results,
  }

  return NextResponse.json(summary)
}
