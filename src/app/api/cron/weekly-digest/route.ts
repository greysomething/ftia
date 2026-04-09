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
 * Authentication: REQUIRES a valid `Authorization: Bearer <CRON_SECRET>`
 * header. There is no query-parameter bypass of any kind. All safety
 * checks (day, hour, already-sent) always run — they cannot be skipped.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { runWeeklyDigestPipeline, getCurrentWeekMonday } from '@/lib/weekly-digest'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export async function GET(req: NextRequest) {
  // Verify cron secret — no bypass, no exceptions.
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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

  // 2. Check if we're at or after the configured send time in the current ISO week.
  //
  // The cron runs hourly. On the configured day-of-week at the configured
  // hour, we start attempting to send. If the weekly list isn't ready yet
  // (not enough productions), we skip and re-check on the next hourly run
  // throughout the rest of the ISO week (Mon–Sun). Once the list becomes
  // ready on any day from the target day forward, we send.
  //
  // The atomic digest_runs lock and the email_logs pre-check in
  // runWeeklyDigestPipeline guarantee we never double-send, regardless
  // of which hour the cron fires on.
  const tz = settings.timezone || 'America/New_York'
  const now = new Date()

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

  // Normalize to ISO week semantics (Monday=1 … Sunday=7) so the comparison
  // works correctly when target=Monday and today=Sunday (which would be
  // Day 0 in JS's Sun-first convention and incorrectly look "before Monday").
  const toIsoDay = (d: number) => (d === 0 ? 7 : d)
  const isoCurrentDay = toIsoDay(currentDay)
  const isoTargetDay = toIsoDay(targetDay)

  const isBeforeTargetDay = isoCurrentDay < isoTargetDay
  const isTargetDayButTooEarly =
    isoCurrentDay === isoTargetDay && currentHour < targetHour

  if (isBeforeTargetDay || isTargetDayButTooEarly) {
    return NextResponse.json({
      skipped: true,
      reason: `Not yet the send window. Current: ${DAY_NAMES[currentDay]} ${currentHour}:${String(currentMinute).padStart(2, '0')} ${tz}. Target: ${DAY_NAMES[targetDay]} ${targetHour}:00+ ${tz}. Will re-check next hour.`,
      checkedAt: new Date().toISOString(),
    })
  }

  // 3. Check if we already sent this ISO week (Mon–Sun) to prevent
  //    duplicate auto-sends. This is a fast short-circuit — the pipeline
  //    itself also has a pre-check and an atomic lock, so this is the
  //    outermost layer of defense-in-depth.
  const isoWeekStart = new Date(now)
  const daysSinceMonday = isoCurrentDay - 1 // 0 for Mon, 6 for Sun
  isoWeekStart.setDate(now.getDate() - daysSinceMonday)
  isoWeekStart.setHours(0, 0, 0, 0)

  const { data: recentSend } = await supabase
    .from('email_logs')
    .select('id')
    .eq('template_slug', 'weekly-digest')
    .like('recipient', 'bulk:%')
    .gte('sent_at', isoWeekStart.toISOString())
    .limit(1)

  if (recentSend && recentSend.length > 0) {
    return NextResponse.json({
      skipped: true,
      reason: 'Digest already sent this ISO week',
      checkedAt: new Date().toISOString(),
    })
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
      triggerType: 'auto',
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
