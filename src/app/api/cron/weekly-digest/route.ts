/**
 * GET /api/cron/weekly-digest
 *
 * Vercel Cron handler — runs every Monday at 10:00 AM ET.
 * Triggers the weekly production digest email to all active members,
 * but only if the current week's list has 40+ productions.
 *
 * Protected by CRON_SECRET to prevent unauthorized triggers.
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes — enough for ~700 emails at 5/sec

export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sets this automatically for cron jobs)
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Forward to the existing send-weekly-digest endpoint
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://productionlist.com'

  try {
    const res = await fetch(`${baseUrl}/api/admin/send-weekly-digest`, {
      method: 'POST',
      headers: {
        // Pass cron secret as admin auth bypass
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
