/**
 * GET/PUT for the enrichment_config row in site_settings.
 * Backs the /admin/enrichment dashboard form.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import {
  getEnrichmentSettings,
  saveEnrichmentSettings,
  ENRICHMENT_DEFAULTS,
  type EnrichmentSettings,
} from '@/lib/enrichment-settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const settings = await getEnrichmentSettings()
  return NextResponse.json({ ok: true, settings })
}

export async function PUT(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  // Coerce + clamp to safe ranges
  const next: EnrichmentSettings = {
    enabled: Boolean(body.enabled ?? ENRICHMENT_DEFAULTS.enabled),
    batch_size: clamp(toInt(body.batch_size, ENRICHMENT_DEFAULTS.batch_size), 1, 50),
    target_companies: Boolean(body.target_companies ?? ENRICHMENT_DEFAULTS.target_companies),
    target_crew: Boolean(body.target_crew ?? ENRICHMENT_DEFAULTS.target_crew),
    min_days_between_runs: clamp(
      toInt(body.min_days_between_runs, ENRICHMENT_DEFAULTS.min_days_between_runs),
      1, 365,
    ),
  }

  try {
    await saveEnrichmentSettings(next)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Save failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, settings: next })
}

function toInt(v: any, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : fallback
}
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
