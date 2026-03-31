import { createAdminClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export type EventType =
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'register'
  | 'password_reset'
  | 'password_reset_complete'
  | 'password_reset_failed'
  | 'email_sent'
  | 'membership_changed'
  | 'pdf_download'
  | 'profile_update'
  | 'contact_form'

interface LogActivityOptions {
  userId?: string | null
  email?: string | null
  eventType: EventType
  metadata?: Record<string, unknown>
  /** Pass request headers if calling from a route handler */
  reqHeaders?: Headers
}

/**
 * Log a user activity event. Fire-and-forget — never throws.
 * Uses Vercel geo headers when available, falls back to x-forwarded-for.
 */
export async function logActivity(opts: LogActivityOptions): Promise<void> {
  try {
    const hdrs = opts.reqHeaders ?? (await headers())

    const ip =
      hdrs.get('x-real-ip') ??
      hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      null

    const userAgent = hdrs.get('user-agent') ?? null

    // Vercel provides geo headers automatically
    const country = hdrs.get('x-vercel-ip-country') ?? null
    const city = hdrs.get('x-vercel-ip-city') ? decodeURIComponent(hdrs.get('x-vercel-ip-city')!) : null
    const region = hdrs.get('x-vercel-ip-country-region') ?? null

    const supabase = createAdminClient()

    // If we have a userId but no email, look it up so the activity log
    // is searchable by email even for server-side events (webhooks, etc.)
    let email = opts.email ?? null
    if (!email && opts.userId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('email')
        .eq('id', opts.userId)
        .single()
      email = (profile as any)?.email ?? null
    }

    await supabase.from('activity_log').insert({
      user_id: opts.userId ?? null,
      email,
      event_type: opts.eventType,
      ip_address: ip,
      user_agent: userAgent,
      country,
      city,
      region,
      metadata: opts.metadata ?? {},
    })
  } catch (err) {
    console.error('[activity-log] Failed to log activity:', err)
  }
}
