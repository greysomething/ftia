import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'
export const maxDuration = 90

/**
 * POST /api/admin/blog/[id]/fix-claim
 *
 * Two modes:
 *   { mode: 'preview', claim, status, source?, reasoning? }
 *     → calls Claude to locate the offending text in the article HTML and
 *       generate a corrected version. Returns { original_text, corrected_text,
 *       explanation } for the admin to review.
 *
 *   { mode: 'apply', original_text, corrected_text }
 *     → performs a literal find/replace in blog_posts.content and saves.
 *       Fails (400) if original_text isn't found verbatim — admin should
 *       hand-edit instead.
 *
 * Splitting into two phases lets the admin see exactly what's about to
 * change before any DB write, and avoids a long-running write transaction.
 */

const MODEL = 'claude-sonnet-4-5-20250929'
const MAX_TOKENS = 2048

const FIX_SYSTEM_PROMPT = `You are an editor for film & TV industry journalism. The fact-checker has flagged a specific claim in a blog post as inaccurate. Your job is to:

1. Locate the smallest contiguous HTML substring of the article that contains the offending claim. This MUST be copied byte-for-byte from the article — preserve every tag, attribute, whitespace, and entity exactly. Pick the smallest unit that contains the full claim and reads naturally on its own (usually a sentence; sometimes a phrase inside one).
2. Produce a corrected version of that same substring. The correction should:
   - Stay factually accurate based on the fact-checker's reasoning
   - Preserve the surrounding HTML structure (same opening/closing tags)
   - Match the article's tone and reading level
   - Be the minimum change needed — do NOT rewrite surrounding sentences
   - If the claim cannot be salvaged (no reliable replacement fact), remove the offending sentence/phrase cleanly while keeping the paragraph readable

Return JSON only:
{
  "original_text": "exact substring from article HTML",
  "corrected_text": "the replacement HTML",
  "explanation": "1 sentence explaining what changed and why"
}

If you cannot confidently locate the claim in the article, return:
{ "error": "Could not locate the claim in the article text." }`

interface PreviewBody {
  mode: 'preview'
  claim: string
  status?: string
  source?: string | null
  reasoning?: string | null
}

interface ApplyBody {
  mode: 'apply'
  original_text: string
  corrected_text: string
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: idStr } = await ctx.params
  const id = Number(idStr)
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = (await req.json().catch(() => null)) as PreviewBody | ApplyBody | null
  if (!body || !body.mode) {
    return NextResponse.json({ error: 'Missing mode' }, { status: 400 })
  }

  const supabase = createAdminClient()

  if (body.mode === 'preview') {
    return handlePreview(id, supabase, body)
  }
  if (body.mode === 'apply') {
    return handleApply(id, supabase, body)
  }
  return NextResponse.json({ error: 'Unknown mode' }, { status: 400 })
}

async function handlePreview(
  id: number,
  supabase: ReturnType<typeof createAdminClient>,
  body: PreviewBody,
) {
  const apiKey = process.env.SCANNER_ANTHROPIC_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI API key not configured' }, { status: 500 })
  }
  if (!body.claim || typeof body.claim !== 'string') {
    return NextResponse.json({ error: 'Missing claim' }, { status: 400 })
  }

  const { data: post, error } = await supabase
    .from('blog_posts')
    .select('id, title, content')
    .eq('id', id)
    .maybeSingle()
  if (error || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const html = String((post as any).content ?? '')
  if (!html.trim()) {
    return NextResponse.json({ error: 'Post has no content' }, { status: 400 })
  }

  const userMessage = `ARTICLE TITLE: ${(post as any).title ?? ''}

ARTICLE HTML:
${html}

FLAGGED CLAIM (status: ${body.status ?? 'unknown'}):
"${body.claim}"

FACT-CHECKER'S REASONING:
${body.reasoning || '(none provided)'}

SOURCE CITED BY FACT-CHECKER:
${body.source || '(none)'}

Find the offending text in the article HTML and propose a correction.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: FIX_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    return NextResponse.json(
      { error: `AI request failed (${res.status}): ${errText.slice(0, 200)}` },
      { status: 502 },
    )
  }

  const json = await res.json() as {
    content?: Array<{ type: string; text?: string }>
    error?: { message?: string }
  }
  if (json.error) {
    return NextResponse.json({ error: json.error.message ?? 'AI error' }, { status: 502 })
  }

  const text = (json.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('').trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return NextResponse.json(
      { error: 'AI did not return JSON. Raw: ' + text.slice(0, 200) },
      { status: 502 },
    )
  }

  let parsed: { original_text?: string; corrected_text?: string; explanation?: string; error?: string }
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (e: any) {
    return NextResponse.json({ error: 'Malformed AI JSON: ' + e.message }, { status: 502 })
  }

  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 422 })
  }
  if (!parsed.original_text || parsed.corrected_text === undefined) {
    return NextResponse.json({ error: 'AI response missing required fields' }, { status: 502 })
  }

  // Verify the original_text actually appears in the article. If not, the
  // admin won't be able to apply — surface that immediately rather than
  // failing at apply time.
  const found = html.includes(parsed.original_text)

  return NextResponse.json({
    ok: true,
    found,
    original_text: parsed.original_text,
    corrected_text: parsed.corrected_text,
    explanation: parsed.explanation ?? '',
  })
}

async function handleApply(
  id: number,
  supabase: ReturnType<typeof createAdminClient>,
  body: ApplyBody,
) {
  if (!body.original_text || body.corrected_text === undefined) {
    return NextResponse.json({ error: 'Missing original_text or corrected_text' }, { status: 400 })
  }

  const { data: post, error } = await supabase
    .from('blog_posts')
    .select('id, content')
    .eq('id', id)
    .maybeSingle()
  if (error || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const html = String((post as any).content ?? '')
  const idx = html.indexOf(body.original_text)
  if (idx === -1) {
    return NextResponse.json(
      { error: 'Could not find the original text in the article. The article may have been edited since the fix was previewed — please re-run "Fix in article".' },
      { status: 409 },
    )
  }

  // Replace only the first occurrence to be safe.
  const updated = html.slice(0, idx) + body.corrected_text + html.slice(idx + body.original_text.length)

  const { error: updErr } = await supabase
    .from('blog_posts')
    .update({ content: updated, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  revalidatePath('/admin/blog')
  revalidatePath(`/admin/blog/${id}/edit`)

  return NextResponse.json({ ok: true })
}
