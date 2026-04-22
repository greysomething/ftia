import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: idStr } = await ctx.params
  const id = Number(idStr)
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const body = await req.json()
  const allowed = ['name', 'url', 'source_type', 'enabled']
  const patch: Record<string, any> = {}
  for (const k of allowed) if (k in body) patch[k] = body[k]
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('discovery_sources').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ source: data })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: idStr } = await ctx.params
  const id = Number(idStr)
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('discovery_sources').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
