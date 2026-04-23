/**
 * Nightly AI enrichment settings — stored in `site_settings` under
 * key='enrichment_config'. Lets the admin tune the cron without redeploying.
 *
 * Schedule note: Vercel crons run on UTC and have no DST awareness, so the
 * cron expression in vercel.json is fixed (16:00 UTC = 9am PDT / 8am PST).
 * The `enabled` flag here is the runtime kill-switch.
 */
import { createAdminClient } from '@/lib/supabase/server'

const SETTINGS_KEY = 'enrichment_config'

export interface EnrichmentSettings {
  enabled: boolean
  batch_size: number          // # of entities per nightly run (each = ~1 web-research call)
  target_companies: boolean   // include companies in the candidate pool
  target_crew: boolean        // include crew in the candidate pool
  min_days_between_runs: number // skip an entity that was enriched within this window
}

export const ENRICHMENT_DEFAULTS: EnrichmentSettings = {
  enabled: true,
  batch_size: 10,
  target_companies: true,
  target_crew: true,
  min_days_between_runs: 30,
}

export async function getEnrichmentSettings(): Promise<EnrichmentSettings> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .single()

    if (!error && data?.value) {
      return { ...ENRICHMENT_DEFAULTS, ...(data.value as Partial<EnrichmentSettings>) }
    }
  } catch {
    // Table missing or no row yet — fall back to defaults.
  }
  return ENRICHMENT_DEFAULTS
}

export async function saveEnrichmentSettings(settings: EnrichmentSettings) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('site_settings')
    .upsert({
      key: SETTINGS_KEY,
      value: settings,
      updated_at: new Date().toISOString(),
    })
  if (error) throw error
}
