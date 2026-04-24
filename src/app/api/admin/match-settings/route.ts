import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getMatchSettings, saveMatchSettings, MATCH_DEFAULTS, type MatchSettings } from '@/lib/match-settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const settings = await getMatchSettings()
  return NextResponse.json({ settings, defaults: MATCH_DEFAULTS })
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Partial<MatchSettings>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const next: MatchSettings = {
    enabled: typeof body.enabled === 'boolean' ? body.enabled : MATCH_DEFAULTS.enabled,
    auto_threshold: Number(body.auto_threshold ?? MATCH_DEFAULTS.auto_threshold),
  }

  try {
    const saved = await saveMatchSettings(next)
    return NextResponse.json({ settings: saved })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Save failed' }, { status: 500 })
  }
}
