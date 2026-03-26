import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/admin/weekly-backfill
 *
 * Batch back-fill ALL weekly lists that have fewer than `targetCount`
 * productions. Uses the same supplement logic as /api/admin/weekly-supplements
 * but runs across every under-filled week in one request.
 *
 * Body: { targetCount?: number, dryRun?: boolean }
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { targetCount = 40, dryRun = false } = await req.json().catch(() => ({}))

  const supabase = createAdminClient()

  // 1. Get all weeks and their current counts
  const allEntries: Array<{ week_monday: string; production_id: number }> = []
  let page = 0
  while (true) {
    const from = page * 1000
    const { data } = await (supabase as any)
      .from('production_week_entries')
      .select('week_monday, production_id')
      .range(from, from + 999)
    if (!data || data.length === 0) break
    allEntries.push(...data)
    if (data.length < 1000) break
    page++
  }

  // Build week → set of production_ids
  const weekMap: Record<string, Set<number>> = {}
  for (const e of allEntries) {
    if (!weekMap[e.week_monday]) weekMap[e.week_monday] = new Set()
    weekMap[e.week_monday].add(e.production_id)
  }

  // Find weeks that need filling
  const weeksToFill = Object.entries(weekMap)
    .filter(([, ids]) => ids.size < targetCount)
    .sort(([a], [b]) => a.localeCompare(b))

  if (weeksToFill.length === 0) {
    return NextResponse.json({
      ok: true,
      message: `All weeks already have ${targetCount}+ productions. Nothing to do.`,
      weeksProcessed: 0,
    })
  }

  // 2. Fetch all published productions (for supplement candidates)
  const allProductions: Array<{
    id: number
    production_date_start: string | null
    production_date_end: string | null
  }> = []
  let pPage = 0
  while (true) {
    const from = pPage * 1000
    const { data } = await supabase
      .from('productions')
      .select('id, production_date_start, production_date_end')
      .eq('visibility', 'publish')
      .range(from, from + 999)
    if (!data || data.length === 0) break
    allProductions.push(...data)
    if (data.length < 1000) break
    pPage++
  }

  // 3. Build oldest-week map for all productions (for recycling priority)
  const oldestWeekMap: Record<number, string> = {}
  for (const e of allEntries) {
    const existing = oldestWeekMap[e.production_id]
    if (!existing || e.week_monday < existing) {
      oldestWeekMap[e.production_id] = e.week_monday
    }
  }

  const today = new Date().toISOString().split('T')[0]

  function getTier(p: { production_date_start: string | null; production_date_end: string | null }): number {
    const endDate = p.production_date_end ?? p.production_date_start
    if (endDate && endDate >= today) return 1
    if (!p.production_date_start && !p.production_date_end) return 2
    return 3
  }

  // 4. Process each under-filled week
  const results: Array<{ week: string; before: number; added: number; after: number }> = []
  let totalAdded = 0

  for (const [weekMonday, existingIds] of weeksToFill) {
    const currentCount = existingIds.size
    const slotsToFill = targetCount - currentCount

    // Filter candidates: published + not already in this week
    const candidates = allProductions.filter(p => !existingIds.has(p.id))

    // Sort with same tier logic as weekly-supplements
    const sorted = [...candidates].sort((a, b) => {
      const tierDiff = getTier(a) - getTier(b)
      if (tierDiff !== 0) return tierDiff
      const aWeek = oldestWeekMap[a.id] ?? '9999-99-99'
      const bWeek = oldestWeekMap[b.id] ?? '9999-99-99'
      if (aWeek !== bWeek) return aWeek.localeCompare(bWeek)
      return (a.production_date_start ?? '').localeCompare(b.production_date_start ?? '')
    })

    const toAdd = sorted.slice(0, slotsToFill)

    if (toAdd.length === 0) {
      results.push({ week: weekMonday, before: currentCount, added: 0, after: currentCount })
      continue
    }

    if (!dryRun) {
      const entries = toAdd.map(p => ({
        production_id: p.id,
        week_monday: weekMonday,
        is_supplement: true,
      }))

      for (let i = 0; i < entries.length; i += 100) {
        const chunk = entries.slice(i, i + 100)
        await (supabase as any)
          .from('production_week_entries')
          .upsert(chunk, { onConflict: 'production_id,week_monday' })
      }

      // Update our in-memory set so subsequent weeks see the updated state
      for (const p of toAdd) {
        existingIds.add(p.id)
      }
    }

    totalAdded += toAdd.length
    results.push({
      week: weekMonday,
      before: currentCount,
      added: toAdd.length,
      after: currentCount + toAdd.length,
    })
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    targetCount,
    weeksProcessed: weeksToFill.length,
    totalAdded,
    message: dryRun
      ? `[DRY RUN] Would add ${totalAdded} supplements across ${weeksToFill.length} weeks.`
      : `Added ${totalAdded} supplements across ${weeksToFill.length} weeks.`,
    details: results,
  })
}
