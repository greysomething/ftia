/**
 * Blog post verifiability scorer.
 *
 * After a blog post is generated (manually or by the cron job), this module
 * runs a second Claude call with web_search enabled. Claude identifies every
 * factual claim in the article, searches the web for each one, and returns
 * a 0–100 score plus a per-claim report.
 *
 * Posts below the configured threshold are auto-discarded (visibility=trash).
 */

import type { createAdminClient } from '@/lib/supabase/server'

export interface VerificationClaim {
  claim: string
  status: 'verified' | 'unverified' | 'false'
  source?: string | null
  reasoning?: string | null
}

export interface VerificationReport {
  score: number                          // 0–100
  total_claims: number
  verified: number
  unverified: number
  false_count: number
  summary: string
  claims: VerificationClaim[]
  ran_at: string
  model: string
}

const VERIFIER_MODEL = 'claude-sonnet-4-5-20250929'
const VERIFIER_MAX_TOKENS = 4096
const WEB_SEARCH_MAX_USES = 8

const VERIFIER_SYSTEM_PROMPT = `You are a meticulous fact-checker for film & TV industry journalism. Your job is to identify every concrete factual claim in a blog post and verify each one using web search against authoritative sources (Variety, The Hollywood Reporter, Deadline, IMDb Pro, Wikipedia, official studio/network press releases).

For each claim:
- "verified" — you found the same fact in at least one authoritative public source
- "unverified" — you searched but could not confirm the claim either way
- "false" — your search found evidence the claim is wrong or contradicted

Concrete claims include: project titles linked to people, named cast/crew with roles, production company involvements, network/studio/platform deals, filming locations, dates, episode counts, comparisons to other named projects, awards, prior credits attributed to a person.

Skip generic narrative phrasing like "is now in pre-production" or "will appeal to working professionals" — those aren't verifiable claims.

Be strict. If a person's name appears in the article and you can't confirm they are attached to this project, mark that claim "unverified" or "false". If the article says "Showrunner X (whose previous work includes Y)", verify both that X is the showrunner AND that they did Y.

Return a JSON object only:
{
  "claims": [
    { "claim": "exact claim text", "status": "verified|unverified|false", "source": "URL or publication name", "reasoning": "1 sentence on what you found" }
  ],
  "summary": "1-2 sentence overall assessment"
}`

interface AnthropicMessageContent {
  type: string
  text?: string
}

interface AnthropicResponse {
  content?: AnthropicMessageContent[]
  stop_reason?: string
  error?: { message?: string; type?: string }
}

/**
 * Strip HTML tags so the verifier sees the prose, not markup.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Compute a 0–100 score from claim verification results.
 * Verified = 1.0, Unverified = 0.4, False = 0.
 * Returns 100 if there are no concrete claims (empty article or pure narrative).
 */
function computeScore(claims: VerificationClaim[]): number {
  if (claims.length === 0) return 100
  const total = claims.length
  let weighted = 0
  for (const c of claims) {
    if (c.status === 'verified') weighted += 1
    else if (c.status === 'unverified') weighted += 0.4
    // false = 0
  }
  return Math.round((weighted / total) * 100)
}

/**
 * Verify a blog post using Claude + web search. Returns the report.
 * Throws on API errors. Caller is responsible for storing the result.
 */
export async function verifyBlogPostContent(
  apiKey: string,
  title: string,
  excerpt: string,
  contentHtml: string,
): Promise<VerificationReport> {
  const plain = htmlToPlainText(contentHtml)
  const userMessage = `BLOG POST TO FACT-CHECK\n\nTitle: ${title}\n\nExcerpt: ${excerpt || '(none)'}\n\nArticle:\n${plain}\n\nIdentify every concrete factual claim, search the web to verify each, and return your JSON report.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: VERIFIER_MODEL,
      max_tokens: VERIFIER_MAX_TOKENS,
      system: VERIFIER_SYSTEM_PROMPT,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: WEB_SEARCH_MAX_USES,
        },
      ],
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Verifier API error ${res.status}: ${errText.slice(0, 300)}`)
  }

  const json = (await res.json()) as AnthropicResponse
  if (json.error) throw new Error(`Verifier returned error: ${json.error.message}`)

  // The final assistant message contains the JSON report. With tool use, the
  // text block we want is the LAST one (after all tool_use/tool_result rounds).
  const textBlocks = (json.content ?? []).filter(b => b.type === 'text' && b.text)
  const finalText = textBlocks[textBlocks.length - 1]?.text ?? ''
  const jsonMatch = finalText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Verifier did not return JSON. Raw text: ' + finalText.slice(0, 200))
  }

  let parsed: { claims?: VerificationClaim[]; summary?: string }
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (e: any) {
    throw new Error('Verifier returned malformed JSON: ' + e.message)
  }

  const claims: VerificationClaim[] = (parsed.claims ?? []).map(c => ({
    claim: String(c.claim ?? '').slice(0, 500),
    status: (['verified', 'unverified', 'false'].includes(c.status as string)
      ? c.status
      : 'unverified') as VerificationClaim['status'],
    source: c.source ? String(c.source).slice(0, 500) : null,
    reasoning: c.reasoning ? String(c.reasoning).slice(0, 500) : null,
  }))

  const verified = claims.filter(c => c.status === 'verified').length
  const unverified = claims.filter(c => c.status === 'unverified').length
  const false_count = claims.filter(c => c.status === 'false').length

  return {
    score: computeScore(claims),
    total_claims: claims.length,
    verified,
    unverified,
    false_count,
    summary: parsed.summary ?? '',
    claims,
    ran_at: new Date().toISOString(),
    model: VERIFIER_MODEL,
  }
}

/**
 * Run verification for a stored blog post and persist the result.
 * If the score is below threshold AND the action is 'discard', moves the
 * post to trash. Returns the report and what action was taken.
 */
export async function verifyAndStore(
  postId: number,
  supabase: ReturnType<typeof createAdminClient>,
  options: {
    apiKey: string
    threshold?: number             // default 85
    action?: 'discard' | 'flag'    // default 'discard'
  },
): Promise<{
  report: VerificationReport
  trashed: boolean
}> {
  const threshold = options.threshold ?? 85
  const action = options.action ?? 'discard'

  // Load the post
  const { data: post, error } = await supabase
    .from('blog_posts')
    .select('id, title, excerpt, content, visibility')
    .eq('id', postId)
    .single()

  if (error || !post) throw new Error(`Blog post #${postId} not found`)

  const report = await verifyBlogPostContent(
    options.apiKey,
    String(post.title ?? ''),
    String(post.excerpt ?? ''),
    String(post.content ?? ''),
  )

  let trashed = false
  const update: Record<string, any> = {
    verifiability_score: report.score,
    verifiability_report: report,
    verifiability_checked_at: report.ran_at,
  }

  if (report.score < threshold && action === 'discard' && (post as any).visibility !== 'trash') {
    update.visibility = 'trash'
    trashed = true
  }

  const { error: updErr } = await supabase
    .from('blog_posts')
    .update(update)
    .eq('id', postId)

  if (updErr) throw new Error(`Failed to store verification: ${updErr.message}`)

  return { report, trashed }
}
