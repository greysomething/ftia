import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { DEFAULT_SETTINGS, SETTINGS_KEY, type PopupSettings } from '@/lib/popup-settings'

export async function GET() {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('site_options')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .single()

  if (data?.value) {
    try {
      const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data.value) }
      return NextResponse.json(settings)
    } catch {
      return NextResponse.json(DEFAULT_SETTINGS)
    }
  }

  return NextResponse.json(DEFAULT_SETTINGS)
}

export async function POST(request: Request) {
  await requireAdmin()
  const supabase = createAdminClient()

  const body = await request.json()
  const settings: PopupSettings = {
    enabled: body.enabled ?? DEFAULT_SETTINGS.enabled,
    trigger: body.trigger ?? DEFAULT_SETTINGS.trigger,
    delaySeconds: Number(body.delaySeconds) || DEFAULT_SETTINGS.delaySeconds,
    pageCount: Number(body.pageCount) || DEFAULT_SETTINGS.pageCount,
    exitIntentEnabled: body.exitIntentEnabled ?? DEFAULT_SETTINGS.exitIntentEnabled,
    dismissDurationDays: Number(body.dismissDurationDays) || DEFAULT_SETTINGS.dismissDurationDays,
    hideForLoggedIn: body.hideForLoggedIn ?? DEFAULT_SETTINGS.hideForLoggedIn,
    heading: body.heading || DEFAULT_SETTINGS.heading,
    subheading: body.subheading || DEFAULT_SETTINGS.subheading,
    ctaText: body.ctaText || DEFAULT_SETTINGS.ctaText,
  }

  const { error } = await supabase
    .from('site_options')
    .upsert(
      { key: SETTINGS_KEY, value: JSON.stringify(settings), updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, settings })
}
