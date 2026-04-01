import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { clearWeekEntries } from '@/lib/queries'
import { revalidatePath } from 'next/cache'

/**
 * DELETE /api/admin/clear-week
 * Deletes all production_week_entries for a given week.
 * Body: { weekMonday: "YYYY-MM-DD" } or { weeks: ["YYYY-MM-DD", ...] }
 */
export async function DELETE(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const weeks: string[] = body.weeks ?? (body.weekMonday ? [body.weekMonday] : [])

    if (weeks.length === 0) {
      return NextResponse.json({ error: 'No week(s) specified.' }, { status: 400 })
    }

    let totalDeleted = 0
    for (const week of weeks) {
      const deleted = await clearWeekEntries(week)
      totalDeleted += deleted
    }

    revalidatePath('/admin/weekly-lists')
    revalidatePath('/productions')

    return NextResponse.json({
      ok: true,
      message: `Cleared ${totalDeleted} entries from ${weeks.length} week(s).`,
      deleted: totalDeleted,
      weeks,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to clear week' }, { status: 500 })
  }
}
