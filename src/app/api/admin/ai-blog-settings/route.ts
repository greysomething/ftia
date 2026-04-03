import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET — fetch all blog generation settings
export async function GET() {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('blog_generation_settings')
    .select('key, value, updated_at')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Convert rows to a key-value map
  const settings: Record<string, string> = {}
  for (const row of data ?? []) {
    settings[row.key] = row.value
  }

  return NextResponse.json({ settings })
}

// PUT — update one or more settings
export async function PUT(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as Record<string, string>
  const supabase = createAdminClient()

  const validKeys = [
    'enabled', 'posts_per_day', 'auto_publish',
    'min_production_data_score', 'exclude_types', 'batch_size',
  ]

  const updates: { key: string; value: string; updated_at: string }[] = []
  for (const [key, value] of Object.entries(body)) {
    if (validKeys.includes(key)) {
      updates.push({ key, value: String(value), updated_at: new Date().toISOString() })
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No valid settings provided' }, { status: 400 })
  }

  const { error } = await supabase
    .from('blog_generation_settings')
    .upsert(updates, { onConflict: 'key' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
