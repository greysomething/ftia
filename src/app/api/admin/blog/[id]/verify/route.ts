import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyAndStore } from '@/lib/blog-verifier'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/admin/blog/[id]/verify
 *
 * Manually re-run the verifiability check on a single blog post. Stores the
 * report and (if score < threshold and action='discard') trashes the post.
 *
 * The discard behaviour is intentional even on manual re-verify so admins
 * see consistent behaviour with the cron job. They can still rescue from
 * trash if needed.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.SCANNER_ANTHROPIC_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI API key not configured' }, { status: 500 })
  }

  const { id: idStr } = await ctx.params
  const id = Number(idStr)
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const supabase = createAdminClient()

  // Read current settings
  const { data: settingsRows } = await supabase
    .from('blog_generation_settings').select('key, value')
    .in('key', ['verifiability_threshold', 'verifiability_action'])
  const settings: Record<string, string> = {}
  for (const s of settingsRows ?? []) settings[s.key] = s.value

  const threshold = parseInt(settings.verifiability_threshold || '85', 10)
  const action = (settings.verifiability_action === 'flag' ? 'flag' : 'discard') as 'discard' | 'flag'

  try {
    const { report, trashed } = await verifyAndStore(id, supabase, { apiKey, threshold, action })
    revalidatePath('/admin/blog')
    revalidatePath(`/admin/blog/${id}/edit`)
    return NextResponse.json({ ok: true, score: report.score, trashed, report })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Verification failed' }, { status: 500 })
  }
}
