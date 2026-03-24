import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const ALLOWED_FIELDS = ['is_active', 'allow_signups']

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { planId, field, value } = await req.json()

  if (!planId || !ALLOWED_FIELDS.includes(field)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('membership_levels')
    .update({ [field]: value })
    .eq('id', planId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidatePath('/admin/membership-plans')
  revalidatePath('/membership-plans')

  return NextResponse.json({ ok: true })
}
