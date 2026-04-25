import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { gatePublicPitchApi } from '@/lib/pitch-marketplace-gate'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
const ALLOWED_TYPES = ['application/pdf']

export async function POST(req: NextRequest) {
  // Marketplace gate first — if disabled and viewer isn't admin, 404.
  const blocked = await gatePublicPitchApi()
  if (blocked) return blocked

  let user
  try { user = await requireAuth() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const pitchId = Number(formData.get('pitch_id'))
  const fileType = String(formData.get('file_type') || 'other')

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!pitchId) {
    return NextResponse.json({ error: 'pitch_id is required' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File size must be under 25MB' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify user owns the pitch
  const { data: pitch } = await supabase
    .from('pitches')
    .select('user_id')
    .eq('id', pitchId)
    .single()
  if (!pitch || pitch.user_id !== user.id) {
    return NextResponse.json({ error: 'You do not own this pitch' }, { status: 403 })
  }

  // Upload to Supabase Storage
  const bytes = await file.arrayBuffer()
  const ext = file.name.split('.').pop() || 'pdf'
  const storagePath = `pitches/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('media')
    .upload(storagePath, Buffer.from(bytes), {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from('media').getPublicUrl(storagePath)

  // Save to pitch_attachments
  const { data: attachment, error: insertError } = await supabase
    .from('pitch_attachments')
    .insert({
      pitch_id: pitchId,
      user_id: user.id,
      file_name: file.name,
      storage_path: storagePath,
      file_type: fileType,
      mime_type: file.type,
      file_size: file.size,
    })
    .select('id, file_name, storage_path, file_type, mime_type, file_size, created_at')
    .single()

  if (insertError) {
    // Clean up uploaded file
    await supabase.storage.from('media').remove([storagePath])
    return NextResponse.json({ error: `Save failed: ${insertError.message}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    attachment,
    url: urlData.publicUrl,
  })
}
