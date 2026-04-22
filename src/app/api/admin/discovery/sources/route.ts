import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('discovery_sources')
    .select('*')
    .order('enabled', { ascending: false })
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sources: data ?? [] })
}

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { name, url, source_type = 'rss', enabled = true } = await req.json()
  if (!name || !url) return NextResponse.json({ error: 'name and url required' }, { status: 400 })
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: 'URL must start with http(s)://' }, { status: 400 })
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('discovery_sources')
    .insert({ name, url, source_type, enabled })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ source: data })
}
