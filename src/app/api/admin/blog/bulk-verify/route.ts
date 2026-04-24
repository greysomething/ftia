import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyAndStore } from '@/lib/blog-verifier'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/admin/blog/bulk-verify
 *
 * Re-runs the verifiability check on a specific set of blog post IDs (admin
 * picks them from the Blog admin table via the bulk action). Posts are
 * processed sequentially with light pacing — Anthropic web_search is rate
 * limited and bursting causes 429s.
 *
 * The discard/flag behaviour matches what the cron and the per-post manual
 * verify do: it reads `blog_generation_settings.verifiability_action` and
 * either trashes posts below threshold or just records the new score.
 *
 * Streams progress via SSE so the UI can show per-post status while a long
 * batch runs. Caps at MAX_BATCH posts so a runaway selection can't burn the
 * full 5-minute Vercel budget.
 *
 * Body: { ids: number[] }
 */
const MAX_BATCH = 25

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.SCANNER_ANTHROPIC_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI API key not configured' }, { status: 500 })
  }

  let body: any = {}
  try { body = await req.json() } catch { /* empty body */ }
  const rawIds: any[] = Array.isArray(body.ids) ? body.ids : []
  const ids = rawIds
    .map(v => Number(v))
    .filter(n => Number.isFinite(n) && n > 0)

  if (ids.length === 0) {
    return NextResponse.json({ error: 'No post ids provided' }, { status: 400 })
  }
  if (ids.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Too many posts. Select up to ${MAX_BATCH} at a time.` },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()

  const { data: settingsRows } = await supabase
    .from('blog_generation_settings').select('key, value')
    .in('key', ['verifiability_threshold', 'verifiability_action'])
  const settings: Record<string, string> = {}
  for (const s of settingsRows ?? []) settings[s.key] = s.value
  const threshold = parseInt(settings.verifiability_threshold || '85', 10)
  const action = (settings.verifiability_action === 'flag' ? 'flag' : 'discard') as 'discard' | 'flag'

  // Resolve the actual posts so we can show titles in progress events and skip
  // any IDs that don't exist or aren't AI-generated. Non-AI posts have no
  // factual claims pipeline and would just produce noise.
  const { data: posts, error } = await supabase
    .from('blog_posts')
    .select('id, title, ai_generated, visibility')
    .in('id', ids)
    .eq('ai_generated', true)
    .order('id', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list = posts ?? []
  if (list.length === 0) {
    return NextResponse.json({
      ok: true,
      message: 'No AI-generated posts in selection — nothing to verify.',
      total: 0,
    })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)) } catch { /* closed */ }
      }
      send(JSON.stringify({ type: 'start', total: list.length, threshold, action }))

      let processed = 0
      let trashedCount = 0
      let errorCount = 0
      const summaries: any[] = []

      for (const post of list) {
        try {
          const { report, trashed } = await verifyAndStore(post.id, supabase, { apiKey, threshold, action })
          if (trashed) trashedCount++
          summaries.push({ id: post.id, title: post.title, score: report.score, trashed })
          send(JSON.stringify({
            type: 'progress',
            processed: processed + 1,
            total: list.length,
            id: post.id,
            title: post.title,
            score: report.score,
            trashed,
          }))
        } catch (err: any) {
          errorCount++
          send(JSON.stringify({
            type: 'error',
            id: post.id,
            title: post.title,
            message: err.message?.slice(0, 200) ?? 'Unknown error',
          }))
        }
        processed++
        // Gentle pacing — web search is rate-limited
        await new Promise(r => setTimeout(r, 500))
      }

      // Refresh the admin list so the new scores show up after the user's UI
      // closes the progress panel and the table re-renders on next nav.
      revalidatePath('/admin/blog')

      send(JSON.stringify({
        type: 'done',
        total: list.length,
        processed,
        trashed: trashedCount,
        errors: errorCount,
        summaries,
      }))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
