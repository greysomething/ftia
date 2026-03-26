import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export const maxDuration = 60

/**
 * POST /api/admin/bulk-update-productions
 *
 * Bulk update production visibility or delete productions.
 * When publishing, auto-adds to this week's production list and
 * triggers supplemental fill to reach 40-50 total.
 *
 * Body: { ids: number[], action: 'publish' | 'draft' | 'members_only' | 'trash' | 'delete' }
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { ids, action } = await req.json()

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'No production IDs provided.' }, { status: 400 })
  }
  if (ids.length > 200) {
    return NextResponse.json({ error: 'Maximum 200 productions at a time.' }, { status: 400 })
  }

  const validActions = ['publish', 'draft', 'members_only', 'trash', 'delete']
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 })
  }

  const supabase = createAdminClient()
  const results = { updated: 0, deleted: 0, errors: [] as string[], weeklyAdded: 0, supplementsAdded: 0 }

  if (action === 'delete') {
    // Permanent delete
    const { error, count } = await supabase
      .from('productions')
      .delete()
      .in('id', ids)
      .select('*', { count: 'exact', head: true })
    if (error) {
      results.errors.push(error.message)
    } else {
      results.deleted = count ?? ids.length
    }
  } else {
    // Update visibility
    const { error, count } = await supabase
      .from('productions')
      .update({ visibility: action })
      .in('id', ids)
      .select('*', { count: 'exact', head: true })
    if (error) {
      results.errors.push(error.message)
    } else {
      results.updated = count ?? ids.length
    }

    // If publishing, auto-add to this week's production list
    if (action === 'publish' && results.updated > 0) {
      // Calculate this week's Monday
      const now = new Date()
      const day = now.getDay()
      const diff = day === 0 ? -6 : 1 - day
      const monday = new Date(now)
      monday.setDate(now.getDate() + diff)
      const weekMonday = monday.toISOString().split('T')[0]

      // Add each published production to this week's list
      const entries = ids.map(id => ({
        production_id: id,
        week_monday: weekMonday,
        is_supplement: false,
      }))

      // Batch upsert
      for (let i = 0; i < entries.length; i += 100) {
        const chunk = entries.slice(i, i + 100)
        const { error: weekError } = await (supabase as any)
          .from('production_week_entries')
          .upsert(chunk, { onConflict: 'production_id,week_monday' })
        if (!weekError) results.weeklyAdded += chunk.length
      }

      // Now auto-fill supplements to reach 40-50 total
      const { data: currentEntries } = await (supabase as any)
        .from('production_week_entries')
        .select('production_id')
        .eq('week_monday', weekMonday)

      const currentCount = currentEntries?.length ?? 0
      const TARGET_MIN = 40
      const TARGET_MAX = 50

      if (currentCount < TARGET_MIN) {
        // Need to add supplements
        const existingIds = new Set((currentEntries ?? []).map((e: any) => e.production_id))
        const slotsToFill = Math.min(TARGET_MAX, Math.max(TARGET_MIN, currentCount + 10)) - currentCount

        // Find eligible published productions not already in this week
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

        const candidates = allEligible.filter(p => !existingIds.has(p.id))
        const today = new Date().toISOString().split('T')[0]

        // Sort: future dates first, then no date, then past dates
        candidates.sort((a, b) => {
          const endA = a.production_date_end ?? a.production_date_start
          const endB = b.production_date_end ?? b.production_date_start
          const tierA = endA && endA >= today ? 1 : (!a.production_date_start ? 2 : 3)
          const tierB = endB && endB >= today ? 1 : (!b.production_date_start ? 2 : 3)
          if (tierA !== tierB) return tierA - tierB
          return (a.production_date_start ?? '').localeCompare(b.production_date_start ?? '')
        })

        const supplementEntries = candidates.slice(0, slotsToFill).map(p => ({
          production_id: p.id,
          week_monday: weekMonday,
          is_supplement: true,
        }))

        for (let i = 0; i < supplementEntries.length; i += 100) {
          const chunk = supplementEntries.slice(i, i + 100)
          const { error: supError } = await (supabase as any)
            .from('production_week_entries')
            .upsert(chunk, { onConflict: 'production_id,week_monday' })
          if (!supError) results.supplementsAdded += chunk.length
        }
      }

      revalidatePath('/admin/weekly-lists')
      revalidatePath('/productions')
    }
  }

  revalidatePath('/admin/productions')

  const parts: string[] = []
  if (results.updated > 0) parts.push(`${results.updated} production${results.updated !== 1 ? 's' : ''} updated to "${action}"`)
  if (results.deleted > 0) parts.push(`${results.deleted} production${results.deleted !== 1 ? 's' : ''} permanently deleted`)
  if (results.weeklyAdded > 0) parts.push(`added to this week's list`)
  if (results.supplementsAdded > 0) parts.push(`${results.supplementsAdded} supplements auto-added to reach 40+ total`)
  if (results.errors.length > 0) parts.push(`Errors: ${results.errors.join(', ')}`)

  return NextResponse.json({
    ok: results.errors.length === 0,
    ...results,
    message: parts.join('. ') + '.',
  })
}
