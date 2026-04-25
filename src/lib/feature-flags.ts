/**
 * Site-wide feature flags — stored in `site_settings` under
 * key='feature_flags' as a JSON object.
 *
 * Why one row instead of one row per flag? Cheaper to read (single round
 * trip from getFeatureFlags() during a page render) and easier to add new
 * flags without a migration.
 *
 * Adding a new flag: extend FeatureFlags + FEATURE_FLAG_DEFAULTS, then
 * use `await getFeatureFlags()` server-side and gate accordingly.
 */
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/server'

const SETTINGS_KEY = 'feature_flags'

export interface FeatureFlags {
  pitch_marketplace_enabled: boolean
}

export const FEATURE_FLAG_DEFAULTS: FeatureFlags = {
  pitch_marketplace_enabled: false,
}

/**
 * Read the current flags. Cached for the lifetime of a single React
 * server render — header, page body, and footer all see the same value
 * without hitting Supabase three times.
 */
export const getFeatureFlags = cache(async (): Promise<FeatureFlags> => {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle()

    if (!error && data?.value) {
      return { ...FEATURE_FLAG_DEFAULTS, ...(data.value as Partial<FeatureFlags>) }
    }
  } catch {
    // Settings table missing or transient error — fail closed.
  }
  return FEATURE_FLAG_DEFAULTS
})

export async function saveFeatureFlags(next: Partial<FeatureFlags>): Promise<FeatureFlags> {
  const current = await getFeatureFlags()
  const merged: FeatureFlags = {
    ...current,
    ...next,
    // Defensive: coerce to boolean so a string "false" doesn't end up truthy.
    pitch_marketplace_enabled: Boolean(
      next.pitch_marketplace_enabled ?? current.pitch_marketplace_enabled,
    ),
  }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('site_settings')
    .upsert({
      key: SETTINGS_KEY,
      value: merged,
      updated_at: new Date().toISOString(),
    })
  if (error) throw error
  return merged
}
