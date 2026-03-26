import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// GET — list all logos ordered by sort_order
export async function GET() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('network_logos')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST — upload a new logo
export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const name = (formData.get('name') as string)?.trim()

  if (!file || !name) {
    return NextResponse.json({ error: 'Name and file are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Upload to Supabase Storage
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const fileName = `${Date.now()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: uploadError } = await admin.storage
    .from('network-logos')
    .upload(fileName, Buffer.from(bytes), {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // Get public URL
  const { data: urlData } = admin.storage.from('network-logos').getPublicUrl(fileName)

  // Get current max sort_order
  const { data: maxRow } = await admin
    .from('network_logos')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const nextOrder = (maxRow?.sort_order ?? 0) + 1

  // Insert row
  const { data: logo, error: insertError } = await admin
    .from('network_logos')
    .insert({
      name,
      image_url: urlData.publicUrl,
      storage_path: fileName,
      sort_order: nextOrder,
      is_active: true,
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json(logo)
}

// PUT — update logo (reorder, rename, toggle active)
export async function PUT(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const admin = createAdminClient()

  // Batch reorder
  if (body.reorder && Array.isArray(body.reorder)) {
    for (const item of body.reorder) {
      await admin
        .from('network_logos')
        .update({ sort_order: item.sort_order })
        .eq('id', item.id)
    }
    return NextResponse.json({ success: true })
  }

  // Single update
  const { id, name, is_active } = body
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const updates: Record<string, any> = {}
  if (name !== undefined) updates.name = name
  if (is_active !== undefined) updates.is_active = is_active

  const { error } = await admin
    .from('network_logos')
    .update(updates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE — remove a logo
export async function DELETE(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const admin = createAdminClient()

  // Get storage path before deleting
  const { data: logo } = await admin
    .from('network_logos')
    .select('storage_path')
    .eq('id', id)
    .single()

  if (logo?.storage_path) {
    await admin.storage.from('network-logos').remove([logo.storage_path])
  }

  const { error } = await admin.from('network_logos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
