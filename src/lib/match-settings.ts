/**
 * Entity-matcher auto-accept settings — stored in `site_settings` under
 * key='entity_match_settings'.
 *
 * Controls whether the AI Scanner (and the production form's initial load)
 * automatically links a scanned company/crew name to its top DB candidate
 * when the match score is above a configurable threshold.
 *
 * Defaults: enabled at 95% — high-confidence only. Admin can lower to 90 or
 * disable entirely if false positives become a problem.
 */
import { createAdminClient } from '@/lib/supabase/server'

const SETTINGS_KEY = 'entity_match_settings'

export interface MatchSettings {
  enabled: boolean
  auto_threshold: number  // 50–100; only matches at or above this score auto-accept
}

export const MATCH_DEFAULTS: MatchSettings = {
  enabled: true,
  auto_threshold: 95,
}

export async function getMatchSettings(): Promise<MatchSettings> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .single()

    if (!error && data?.value) {
      const merged = { ...MATCH_DEFAULTS, ...(data.value as Partial<MatchSettings>) }
      // Defensive clamp — a bad threshold here would silently break the feature.
      merged.auto_threshold = Math.min(100, Math.max(50, Number(merged.auto_threshold) || MATCH_DEFAULTS.auto_threshold))
      return merged
    }
  } catch {
    // Table missing or no row yet — fall back to defaults.
  }
  return MATCH_DEFAULTS
}

export async function saveMatchSettings(settings: MatchSettings) {
  const clamped: MatchSettings = {
    enabled: !!settings.enabled,
    auto_threshold: Math.min(100, Math.max(50, Number(settings.auto_threshold) || MATCH_DEFAULTS.auto_threshold)),
  }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('site_settings')
    .upsert({
      key: SETTINGS_KEY,
      value: clamped,
      updated_at: new Date().toISOString(),
    })
  if (error) throw error
  return clamped
}
