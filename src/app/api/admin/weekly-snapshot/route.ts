import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { snapshotCurrentWeek } from '@/lib/queries'

/**
 * POST /api/admin/weekly-snapshot
 * Snapshots all active productions into the current week's list.
 * Admin-only endpoint.
 */
export async function POST() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const count = await snapshotCurrentWeek()
    return NextResponse.json({ ok: true, count, message: `Added ${count} productions to this week's list.` })
  } catch (err: any) {
    console.error('Weekly snapshot error:', err)
    return NextResponse.json({ error: err.message ?? 'Snapshot failed' }, { status: 500 })
  }
}
