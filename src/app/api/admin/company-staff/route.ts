import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'
import { revalidatePath } from 'next/cache'

// GET: Search crew members by name (for the staff picker)
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  if (q.length < 2) return NextResponse.json({ results: [] })

  const supabase = createAdminClient()
  // Search across all visibilities so we don't accidentally create a duplicate
  // when a draft crew member already exists. Caller decides whether to use it.
  const { data, error } = await supabase
    .from('crew_members')
    .select('id, name, slug, visibility')
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(15)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ results: data })
}

// Find a free slug for `name` by appending -2, -3, … until one is unused.
async function generateUniqueSlug(supabase: ReturnType<typeof createAdminClient>, name: string): Promise<string> {
  const base = slugify(name) || 'crew'
  let candidate = base
  let suffix = 2
  while (suffix < 50) {
    const { data } = await supabase
      .from('crew_members')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()
    if (!data) return candidate
    candidate = `${base}-${suffix}`
    suffix++
  }
  // Last resort — append timestamp.
  return `${base}-${Date.now()}`
}

// POST: Add a staff member to a company.
// Two modes:
//   1. { company_id, crew_id, position }              — link an existing crew row
//   2. { company_id, name, position, confidence? }    — create the crew row first, then link
//      (used by the AI Research "Add" / "Add All" buttons for staff who aren't in our DB yet)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { company_id, crew_id, position, name, confidence } = body
  if (!company_id) {
    return NextResponse.json({ error: 'company_id required' }, { status: 400 })
  }
  if (!crew_id && !name) {
    return NextResponse.json({ error: 'crew_id or name required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  let resolvedCrewId: number | null = crew_id ?? null

  // Mode 2 — create-then-link path.
  if (!resolvedCrewId && name) {
    const trimmed = String(name).trim()
    if (!trimmed) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })

    // First, last-chance dedup: case-insensitive exact match across all visibilities.
    const { data: existingByName } = await supabase
      .from('crew_members')
      .select('id, name')
      .ilike('name', trimmed)
      .limit(1)
    if (existingByName && existingByName.length > 0) {
      resolvedCrewId = existingByName[0].id
    } else {
      const slug = await generateUniqueSlug(supabase, trimmed)
      // The admin clicked "Add" to attach this person to a company, so the
      // act of linking is itself the curation gate. Publish immediately so
      // the staff card shows up to members on the public company page.
      // (Drafts only get rendered for admins, which made AI-added staff
      // silently invisible to members — see commit 23b1032 for the chain.)
      const nowIso = new Date().toISOString()
      const newRow = {
        name: trimmed,
        slug,
        visibility: 'publish',
        emails: [],
        phones: [],
        roles: position ? [String(position).trim()] : [],
        known_for: [],
        representation: {},
        // Stamp these explicitly so admin lists ordering/filtering by recency
        // works even if the table doesn't have DEFAULT now() set on these
        // columns (legacy WP-migration schema).
        created_at: nowIso,
        updated_at: nowIso,
      }
      const { data: created, error: insErr } = await supabase
        .from('crew_members')
        .insert(newRow)
        .select('id')
        .single()
      if (insErr || !created) {
        return NextResponse.json({ error: insErr?.message ?? 'Failed to create crew member' }, { status: 500 })
      }
      resolvedCrewId = created.id
    }
  }

  if (!resolvedCrewId) {
    return NextResponse.json({ error: 'Could not resolve crew_id' }, { status: 400 })
  }

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
      crew_id: resolvedCrewId,
      position: position || null,
      sort_order: nextOrder,
    }, { onConflict: 'company_id,crew_id' })
    .select('*, crew_members(id, name, slug)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Refresh admin list pages so the new crew shows up everywhere.
  revalidatePath('/admin/crew')
  revalidatePath(`/admin/companies/${company_id}/edit`)
  revalidatePath('/production-role')

  // confidence is currently informational; surface it back in the response so
  // future UI changes can show a "needs review" badge on freshly-created crew.
  return NextResponse.json({ staff: data, created_new_crew: !crew_id, confidence: confidence ?? null })
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
