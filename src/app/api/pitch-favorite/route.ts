import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { gatePublicPitchApi } from '@/lib/pitch-marketplace-gate'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Marketplace gate first — if disabled and viewer isn't admin, 404.
  const blocked = await gatePublicPitchApi()
  if (blocked) return blocked

  let user
  try { user = await requireAuth() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { pitch_id, action } = await req.json().catch(() => ({} as any))

  if (!pitch_id || !['add', 'remove'].includes(action)) {
    return NextResponse.json({ error: 'pitch_id and action (add/remove) are required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  if (action === 'add') {
    await supabase
      .from('pitch_favorites')
      .upsert({ user_id: user.id, pitch_id }, { onConflict: 'user_id,pitch_id', ignoreDuplicates: true })
    return NextResponse.json({ ok: true, favorited: true })
  } else {
    await supabase
      .from('pitch_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('pitch_id', pitch_id)
    return NextResponse.json({ ok: true, favorited: false })
  }
}
