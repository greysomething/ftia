/**
 * GET /api/cron/weekly-digest
 *
 * Vercel Cron handler — runs every hour and checks digest_settings
 * to determine if it's the right day/time to send.
 *
 * Flow:
 *  1. On the configured day, starting at the configured hour, check
 *     if the current week's production list has been published with
 *     enough productions (min_productions setting, default 40).
 *  2. If the list isn't ready yet (admin hasn't published), skip and
 *     re-check on the next hourly run throughout the day.
 *  3. Once the list has enough productions, send the digest.
 *  4. Never re-send if a digest was already sent this week.
 *
 * Protected by CRON_SECRET to prevent unauthorized triggers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { runWeeklyDigestPipeline, getCurrentWeekMonday } from '@/lib/weekly-digest'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export async function GET(req: NextRequest) {
  // Verify cron secret (skip for admin-triggered manual sends)
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isManualTrigger = req.nextUrl.searchParams.get('force') === '1'

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isManualTrigger) {
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

  // 2. Check if it's the right day and at or after the configured hour
  //    (skip this check for manual triggers)
  const tz = settings.timezone || 'America/New_York'
  const now = new Date()

  if (!isManualTrigger) {
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

    // Must be the configured day AND at or after the configured hour.
    if (currentDay !== targetDay || currentHour < targetHour) {
      return NextResponse.json({
        skipped: true,
        reason: `Not the right time. Current: ${DAY_NAMES[currentDay]} ${currentHour}:${String(currentMinute).padStart(2, '0')} ${tz}. Target: ${DAY_NAMES[targetDay]} ${targetHour}:00+ ${tz}`,
        checkedAt: new Date().toISOString(),
      })
    }
  }

  // 3. Check if we already sent this week (prevent duplicate auto-sends)
  //    Manual triggers skip this check — the send endpoint itself deduplicates
  //    at the individual recipient level, so re-sends only go to new recipients.
  if (!isManualTrigger) {
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
  }

  // 4. Check if the current week's production list is ready
  const weekMonday = getCurrentWeekMonday()
  const minProductions = settings.min_productions ?? 40

  const { count } = await supabase
    .from('production_week_entries')
    .select('id', { count: 'exact', head: true })
    .eq('week_monday', weekMonday)

  const productionCount = count ?? 0

  if (productionCount < minProductions) {
    return NextResponse.json({
      skipped: true,
      reason: `Weekly list not ready. Current week (${weekMonday}) has ${productionCount} productions, need ${minProductions}+. Will re-check next hour.`,
      productionCount,
      minProductions,
      weekMonday,
      checkedAt: new Date().toISOString(),
    })
  }

  // 5. List is ready — run the digest pipeline inline (no cross-function fetch)
  console.log(`[Cron] Weekly list ready: ${productionCount} productions for ${weekMonday}. Sending digest.`)

  try {
    const result = await runWeeklyDigestPipeline({
      triggerType: isManualTrigger ? 'manual' : 'auto',
    })

    console.log(`[Cron] Weekly digest result:`, result)

    if (result.error) {
      return NextResponse.json(
        { error: result.error, triggeredAt: new Date().toISOString() },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      ...result,
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
