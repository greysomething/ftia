import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// GET: Search crew members by name (for the staff picker)
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  if (q.length < 2) return NextResponse.json({ results: [] })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('crew_members')
    .select('id, name, slug')
    .ilike('name', `%${q}%`)
    .eq('visibility', 'publish')
    .order('name')
    .limit(15)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ results: data })
}

// POST: Add a staff member to a company
export async function POST(req: NextRequest) {
  const { company_id, crew_id, position } = await req.json()
  if (!company_id || !crew_id) {
    return NextResponse.json({ error: 'company_id and crew_id required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Get next sort_order
  const { data: existing } = await supabase
    .from('company_staff')
    .select('sort_order')
    .eq('company_id', company_id)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('company_staff')
    .upsert({
      company_id,
      crew_id,
      position: position || null,
      sort_order: nextOrder,
    }, { onConflict: 'company_id,crew_id' })
    .select('*, crew_members(id, name, slug)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ staff: data })
}

// DELETE: Remove a staff member from a company
export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase.from('company_staff').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// PATCH: Update a staff member's position
export async function PATCH(req: NextRequest) {
  const { id, position } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('company_staff')
    .update({ position: position || null })
    .eq('id', id)
    .select('*, crew_members(id, name, slug)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ staff: data })
}
