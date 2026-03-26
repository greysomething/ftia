import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logActivity, type EventType } from '@/lib/activity-log'

const ALLOWED_EVENTS: EventType[] = [
  'logout',
  'password_reset',
  'pdf_download',
  'profile_update',
]

export async function POST(req: NextRequest) {
  try {
    const { eventType, metadata } = await req.json()

    if (!ALLOWED_EVENTS.includes(eventType)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    await logActivity({
      userId: user?.id ?? null,
      email: user?.email ?? null,
      eventType,
      metadata: metadata ?? {},
      reqHeaders: req.headers,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to log' }, { status: 500 })
  }
}
