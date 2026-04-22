import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ALLOWED_KEYS = new Set([
  'enabled',
  'extraction_enabled',
  'extraction_batch_size',
  'extraction_daily_cap',
  'extraction_threshold',
  'dedup_threshold',
  'keyword_filter',
])

export async function GET() {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('discovery_settings').select('key, value')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const settings: Record<string, string> = {}
  for (const row of data ?? []) settings[row.key] = row.value
  return NextResponse.json({ settings })
}

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  const updates = Object.entries(body as Record<string, string>)
    .filter(([k]) => ALLOWED_KEYS.has(k))
    .map(([key, value]) => ({ key, value: String(value), updated_at: new Date().toISOString() }))
  if (updates.length === 0) return NextResponse.json({ error: 'No valid settings provided' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase.from('discovery_settings').upsert(updates, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, updated: updates.length })
}
