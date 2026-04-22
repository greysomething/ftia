import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyAndStore } from '@/lib/blog-verifier'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/admin/blog/backfill-verify
 *
 * Runs the verifiability check on every AI-generated blog post that has not
 * yet been verified. Streams progress via SSE.
 *
 * Body: { onlyMissing?: boolean = true, includeTrash?: boolean = false }
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.SCANNER_ANTHROPIC_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI API key not configured' }, { status: 500 })
  }

  let body: any = {}
  try { body = await req.json() } catch { /* empty body OK */ }
  const onlyMissing = body.onlyMissing !== false
  const includeTrash = body.includeTrash === true

  const supabase = createAdminClient()

  const { data: settingsRows } = await supabase
    .from('blog_generation_settings').select('key, value')
    .in('key', ['verifiability_threshold', 'verifiability_action'])
  const settings: Record<string, string> = {}
  for (const s of settingsRows ?? []) settings[s.key] = s.value
  const threshold = parseInt(settings.verifiability_threshold || '85', 10)
  const action = (settings.verifiability_action === 'flag' ? 'flag' : 'discard') as 'discard' | 'flag'

  // Find AI-generated posts to verify
  let query = supabase
    .from('blog_posts')
    .select('id, title, visibility, verifiability_score, verifiability_checked_at')
    .eq('ai_generated', true)
    .order('id', { ascending: true })
  if (!includeTrash) query = query.neq('visibility', 'trash')
  if (onlyMissing) query = query.is('verifiability_checked_at', null)

  const { data: posts, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list = posts ?? []
  if (list.length === 0) {
    return NextResponse.json({ ok: true, message: 'No posts to verify.', total: 0 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)) } catch { /* closed */ }
      }
      send(JSON.stringify({ type: 'start', total: list.length }))

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
