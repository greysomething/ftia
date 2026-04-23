import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Optional folder param so callers (crew profile photos, company logos, etc.)
  // can keep uploads organized. Restricted to a-z/0-9/dash/underscore so we
  // never accept path traversal or unexpected nesting.
  const rawFolder = (formData.get('folder') as string | null)?.trim() ?? 'blog'
  const folder = /^[a-z0-9_-]+$/i.test(rawFolder) ? rawFolder : 'blog'

  const admin = createAdminClient()

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: uploadError } = await admin.storage
    .from('media')
    .upload(fileName, Buffer.from(bytes), {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: urlData } = admin.storage.from('media').getPublicUrl(fileName)

  return NextResponse.json({ url: urlData.publicUrl })
}
