/**
 * Stripe settings management — stored in site_settings table.
 * Allows admin to toggle between test/live mode without redeploying.
 */
import { createAdminClient } from '@/lib/supabase/server'

export interface StripeSettings {
  mode: 'test' | 'live'
  live_secret_key: string
  live_publishable_key: string
  live_webhook_secret: string
  test_secret_key: string
  test_publishable_key: string
  test_webhook_secret: string
}

const SETTINGS_KEY = 'stripe_config'

const DEFAULTS: StripeSettings = {
  mode: 'live',
  live_secret_key: '',
  live_publishable_key: '',
  live_webhook_secret: '',
  test_secret_key: '',
  test_publishable_key: '',
  test_webhook_secret: '',
}

/**
 * Get the active Stripe settings.
 * Falls back to environment variables if no DB settings are saved yet.
 */
export async function getStripeSettings(): Promise<StripeSettings> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .single()

    if (!error && data?.value) {
      return { ...DEFAULTS, ...(data.value as Partial<StripeSettings>) }
    }
  } catch {
    // Table may not exist yet — fall through to env var defaults
  }

  // Fallback: read from env vars (initial setup before admin saves settings or table creation)
  return {
    mode: 'live',
    live_secret_key: process.env.STRIPE_SECRET_KEY ?? '',
    live_publishable_key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
    live_webhook_secret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    test_secret_key: '',
    test_publishable_key: '',
    test_webhook_secret: '',
  }
}

/**
 * Save Stripe settings to DB.
 */
export async function saveStripeSettings(settings: StripeSettings) {
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

/**
 * Get the active Stripe keys based on current mode.
 */
export async function getActiveStripeKeys() {
  const settings = await getStripeSettings()
  const isTest = settings.mode === 'test'
  return {
    mode: settings.mode,
    secretKey: isTest ? settings.test_secret_key : settings.live_secret_key,
    publishableKey: isTest ? settings.test_publishable_key : settings.live_publishable_key,
    webhookSecret: isTest ? settings.test_webhook_secret : settings.live_webhook_secret,
  }
}
