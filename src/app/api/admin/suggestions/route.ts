import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  await requireAdmin()
  const { id, status, admin_notes } = await req.json()

  if (!id || !['applied', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('edit_suggestions')
    .update({ status, admin_notes, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
