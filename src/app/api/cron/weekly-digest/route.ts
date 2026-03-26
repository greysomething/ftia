/**
 * GET /api/cron/weekly-digest
 *
 * Vercel Cron handler — runs every hour and checks digest_settings
 * to determine if it's the right day/time to send. This allows
 * admins to configure the schedule from the UI without redeploying.
 *
 * Protected by CRON_SECRET to prevent unauthorized triggers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // 1. Fetch digest settings
  const { data: settings } = await supabase
    .from('digest_settings')
    .select('*')
    .eq('id', 1)
    .single()

  if (!settings || !settings.enabled) {
    return NextResponse.json({
      skipped: true,
      reason: settings ? 'Digest is disabled' : 'No settings found',
      checkedAt: new Date().toISOString(),
    })
  }

  // 2. Check if it's the right day and hour
  const tz = settings.timezone || 'America/New_York'
  const now = new Date()

  // Get current day/hour in the configured timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })

  const parts = formatter.formatToParts(now)
  const currentDay = DAY_NAMES.indexOf(parts.find(p => p.type === 'weekday')?.value ?? '')
  const currentHour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
  const currentMinute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)

  const targetDay = settings.day_of_week
  const targetHour = settings.send_hour
  const targetMinute = settings.send_minute

  // Check: right day, right hour, within 30 minutes of target time
  // (cron runs hourly, so we check if we're in the right hour window)
  if (currentDay !== targetDay || currentHour !== targetHour) {
    return NextResponse.json({
      skipped: true,
      reason: `Not the right time. Current: ${DAY_NAMES[currentDay]} ${currentHour}:${String(currentMinute).padStart(2, '0')} ${tz}. Target: ${DAY_NAMES[targetDay]} ${targetHour}:${String(targetMinute).padStart(2, '0')} ${tz}`,
      checkedAt: new Date().toISOString(),
    })
  }

  // 3. Check if we already sent this week (prevent duplicate sends)
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay()) // Sunday
  weekStart.setHours(0, 0, 0, 0)

  const { data: recentSend } = await supabase
    .from('email_logs')
    .select('id')
    .eq('template_slug', 'weekly-digest')
    .like('recipient', 'bulk:%')
    .gte('sent_at', weekStart.toISOString())
    .limit(1)

  if (recentSend && recentSend.length > 0) {
    return NextResponse.json({
      skipped: true,
      reason: 'Digest already sent this week',
      checkedAt: new Date().toISOString(),
    })
  }

  // 4. Trigger the digest send
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://productionlist.com'

  try {
    const res = await fetch(`${baseUrl}/api/admin/send-weekly-digest`, {
      method: 'POST',
      headers: {
        'x-cron-secret': cronSecret || '',
      },
    })

    const data = await res.json()
    console.log(`[Cron] Weekly digest result:`, data)

    return NextResponse.json({
      success: res.ok,
      ...data,
      triggeredAt: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('[Cron] Weekly digest failed:', err)
    return NextResponse.json(
      { error: err.message, triggeredAt: new Date().toISOString() },
      { status: 500 }
    )
  }
}
