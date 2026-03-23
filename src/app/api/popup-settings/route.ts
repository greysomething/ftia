import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '@/lib/popup-settings'

/** Public GET — returns popup settings for the client-side popup component */
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
