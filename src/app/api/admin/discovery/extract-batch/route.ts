/**
 * POST /api/admin/discovery/extract-batch
 * Body: { limit?: number }
 *
 * Admin-triggered batch extraction — runs the same logic as the cron
 * endpoint. The `limit` overrides the per-run batch size (still capped by
 * the daily cap setting).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { POST: extractRoute } = await import('../../../cron/discovery-extract/route')
  // Forward the request object so the cron handler can read its body
  return extractRoute(req)
}
