/**
 * POST /api/admin/discovery/poll
 *
 * Admin-triggered manual poll. Calls the same logic as the cron endpoint
 * after checking admin authorization.
 */

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST() {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Call the cron route's POST (internal, same process) so we keep the logic
  // in one place. Vercel deduplicates the call — this is cheap.
  const { POST: pollRoute } = await import('../../../cron/discovery-poll/route')
  return pollRoute()
}
