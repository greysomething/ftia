import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/admin/weekly-supplements
 *
 * Auto-fill a weekly list with supplemental productions from older weeks.
 *
 * Selection logic:
 * 1. Find published productions whose production_date_start is at least 30 days
 *    in the future (still actively filming/pre-production).
 * 2. Exclude productions already in this week's list.
 * 3. Prioritize productions from the OLDEST weekly lists first (recycle from
 *    the earliest weeks), so they get fresh visibility.
 * 4. Fill up to the target count (default 40).
 * 5. Mark entries as is_supplement = true so admin can distinguish them.
 *
 * Body: { weekMonday: string, targetCount?: number }
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { weekMonday, targetCount = 40 } = await req.json()
  if (!weekMonday) {
    return NextResponse.json({ error: 'Missing weekMonday' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // 1. Get current entries for this week (to exclude them)
  const { data: existingEntries } = await (supabase as any)
    .from('production_week_entries')
    .select('production_id')
    .eq('week_monday', weekMonday)

  const existingIds = new Set((existingEntries ?? []).map((e: any) => e.production_id))
  const currentCount = existingIds.size

  if (currentCount >= targetCount) {
    return NextResponse.json({
      ok: true,
      added: 0,
      message: `This week already has ${currentCount} productions (target: ${targetCount}). No supplements needed.`,
    })
  }

  const slotsToFill = targetCount - currentCount

  // 2. Find eligible productions:
  //    - Published
  //    - NOT already in this week's list
  //    - Prioritize by: filming date still in future > no date set > older dates
  //
  // We fetch all published productions and score them for relevance.
  // Supabase has a 1000 row default, so paginate.

  const allEligible: Array<{ id: number; production_date_start: string | null; production_date_end: string | null }> = []
  let ePage = 0
  while (true) {
    const from = ePage * 1000
    const { data } = await supabase
      .from('productions')
      .select('id, production_date_start, production_date_end')
      .eq('visibility', 'publish')
      .range(from, from + 999)
    if (!data || data.length === 0) break
    allEligible.push(...data)
    if (data.length < 1000) break
    ePage++
  }

  if (allEligible.length === 0) {
    return NextResponse.json({
      ok: true,
      added: 0,
      message: 'No eligible published productions found.',
    })
  }

  // Filter out ones already in this week
  const candidates = allEligible.filter(p => !existingIds.has(p.id))

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      added: 0,
      message: 'All eligible productions are already in this week\'s list.',
    })
  }

  // 4. For each candidate, find the oldest week they appeared in
  //    (prioritize productions from the oldest lists)
  const candidateIds = candidates.map(p => p.id)

  // Fetch all week entries for these candidates to find their oldest appearance
  const { data: weekHistory } = await (supabase as any)
    .from('production_week_entries')
    .select('production_id, week_monday')
    .in('production_id', candidateIds)

  // Build a map: production_id → oldest week_monday
  const oldestWeekMap: Record<number, string> = {}
  for (const entry of weekHistory ?? []) {
    const existing = oldestWeekMap[entry.production_id]
    if (!existing || entry.week_monday < existing) {
      oldestWeekMap[entry.production_id] = entry.week_monday
    }
  }

  // 5. Filter and sort candidates:
  //    Only include productions with future dates (30+ days out) or no date set.
  //    Exclude anything with a past filming date — stale supplements aren't useful.
  const futureThreshold = new Date()
  futureThreshold.setDate(futureThreshold.getDate() + 30)
  const futureStr = futureThreshold.toISOString().split('T')[0]

  function isEligibleSupplement(p: { production_date_start: string | null; production_date_end: string | null }): boolean {
    const endDate = p.production_date_end ?? p.production_date_start
    // No dates = eligible (could still be active)
    if (!p.production_date_start && !p.production_date_end) return true
    // Has dates: end/start must be at least 30 days in the future
    return !!endDate && endDate >= futureStr
  }

  const eligibleCandidates = candidates.filter(isEligibleSupplement)

  if (eligibleCandidates.length === 0) {
    return NextResponse.json({
      ok: true,
      added: 0,
      message: 'No eligible productions found with future filming dates (30+ days out).',
    })
  }

  const sorted = eligibleCandidates.sort((a, b) => {
    // Primary: productions with dates first, then no-date
    const aHasDate = !!(a.production_date_start || a.production_date_end)
    const bHasDate = !!(b.production_date_start || b.production_date_end)
    if (aHasDate !== bHasDate) return aHasDate ? -1 : 1
    // Secondary: oldest weekly list appearance first (recycle from earliest weeks)
    const aWeek = oldestWeekMap[a.id] ?? '9999-99-99'
    const bWeek = oldestWeekMap[b.id] ?? '9999-99-99'
    if (aWeek !== bWeek) return aWeek.localeCompare(bWeek)
    // Tertiary: nearest filming date first
    return (a.production_date_start ?? '').localeCompare(b.production_date_start ?? '')
  })

  // 6. Take only as many as needed
  const toAdd = sorted.slice(0, slotsToFill)

  // 7. Insert as supplements
  const entries = toAdd.map(p => ({
    production_id: p.id,
    week_monday: weekMonday,
    is_supplement: true,
  }))

  let added = 0
  // Batch insert in chunks of 100
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100)
    const { error } = await (supabase as any)
      .from('production_week_entries')
      .upsert(chunk, { onConflict: 'production_id,week_monday' })
    if (!error) added += chunk.length
  }

  return NextResponse.json({
    ok: true,
    added,
    currentCount,
    newTotal: currentCount + added,
    target: targetCount,
    message: `Added ${added} supplemental productions. List now has ${currentCount + added} total (target: ${targetCount}).`,
  })
}
