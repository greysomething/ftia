import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getPromptConfig } from '@/lib/ai-prompts'
import { validateResearchUrls } from '@/lib/url-validator'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Cap how many web searches Claude can run per research call.
// Production extractor uses 8; for company/crew enrichment a few more is fine.
const WEB_SEARCH_MAX_USES = 10

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.SCANNER_ANTHROPIC_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI API key not configured (SCANNER_ANTHROPIC_KEY)' }, { status: 500 })
  }

  const { type, name, existingData } = await req.json()
  if (!type || !name) {
    return NextResponse.json({ error: 'Missing type or name' }, { status: 400 })
  }

  const config = await getPromptConfig(type)
  const contextNote = existingData
    ? `\n\nExisting data we already have (fill in what's MISSING, don't repeat what we have):\n${JSON.stringify(existingData, null, 2)}`
    : ''

  // Force the model to actually use web search rather than relying on training data —
  // boutique production companies / individual crew often aren't in the training set.
  const searchInstruction = `\n\nUSE THE web_search TOOL. Do not rely on memory alone. Search the web for the ${type}'s official website, LinkedIn, IMDb, social profiles, and any trade press coverage. Visit at least the first relevant result for each missing field. Then return the JSON.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.max_tokens,
        tools: [
          { type: 'web_search_20250305', name: 'web_search', max_uses: WEB_SEARCH_MAX_USES },
        ],
        messages: [
          {
            role: 'user',
            content: `${config.prompt}${contextNote}\n\nResearch this ${type}: "${name}"${searchInstruction}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      let friendlyMessage = `AI API returned status ${response.status}`
      try {
        const errJson = JSON.parse(errText)
        const msg = errJson?.error?.message || errJson?.message || ''
        if (msg.toLowerCase().includes('credit') || msg.toLowerCase().includes('balance')) {
          friendlyMessage = 'The Anthropic API credit balance is too low. Please add credits at console.anthropic.com.'
        } else if (msg.toLowerCase().includes('rate limit')) {
          friendlyMessage = 'AI API rate limit reached. Please wait a few minutes and try again.'
        } else if (msg.toLowerCase().includes('overloaded')) {
          friendlyMessage = 'The AI service is temporarily overloaded. Please try again in a moment.'
        } else if (msg) {
          friendlyMessage = msg
        }
      } catch {}
      return NextResponse.json({ error: friendlyMessage }, { status: 500 })
    }

    const result = await response.json()

    // With web_search enabled the response is a sequence of content blocks
    // (text → tool_use → tool_result → text → ...). The final JSON sits in the
    // LAST text block, not the first. Concatenate all text blocks as a fallback
    // in case the model split the JSON across multiple text turns.
    const textBlocks = (result.content ?? []).filter((b: any) => b.type === 'text' && b.text)
    const finalText = textBlocks[textBlocks.length - 1]?.text ?? ''
    const allText = textBlocks.map((b: any) => b.text).join('\n')
    const stopReason = result.stop_reason ?? null

    const data = extractJson(finalText) ?? extractJson(allText)
    if (!data) {
      console.warn('[ai-research] Could not parse JSON.', {
        stop_reason: stopReason,
        type, name,
        finalText_preview: finalText.slice(0, 800),
      })
      return NextResponse.json({
        error: stopReason === 'max_tokens'
          ? 'AI response was cut off (max_tokens hit). Bump max_tokens in /admin/ai-settings to 4096+.'
          : `AI did not return valid JSON. stop_reason=${stopReason}. Preview: ${finalText.slice(0, 240)}…`,
        debug: { stop_reason: stopReason, preview: finalText.slice(0, 1500) },
      }, { status: 500 })
    }

    // Validate all URLs in the AI response
    const { data: validated, validation_report, total_checked, total_valid, total_invalid } = await validateResearchUrls(data)
    if (total_invalid > 0) {
      console.warn(`[ai-research] ${type} "${name}": ${total_invalid}/${total_checked} URLs invalid:`,
        validation_report.filter(r => !r.valid).map(r => `${r.field}: ${r.url} (${r.reason})`))
    }

    return NextResponse.json({ ok: true, data: validated, url_validation: { total_checked, total_valid, total_invalid } })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'AI research failed' }, { status: 500 })
  }
}

/**
 * Robust JSON extraction from a free-form LLM response.
 *
 * Handles the common shapes the model returns when web_search is enabled:
 *  • Plain JSON object
 *  • JSON wrapped in ```json … ``` fences with prose around it
 *  • Prose followed by JSON ("Based on my research, here's the data: { … }")
 *  • Multiple `{…}` snippets in commentary (we prefer the longest valid one)
 */
function extractJson(text: string): any | null {
  if (!text) return null

  // 1. Strip ```json … ``` or ``` … ``` fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()) } catch { /* fall through */ }
  }

  // 2. Try direct parse
  try { return JSON.parse(text.trim()) } catch { /* fall through */ }

  // 3. Greedy outermost-object match (works when there's prose around one JSON block)
  const greedy = text.match(/\{[\s\S]*\}/)
  if (greedy) {
    try { return JSON.parse(greedy[0]) } catch { /* fall through */ }
  }

  // 4. Walk all `{…}` candidates with brace-balancing, keep the longest one that parses
  const candidates: string[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue
    let depth = 0
    let inStr = false
    let esc = false
    for (let j = i; j < text.length; j++) {
      const ch = text[j]
      if (esc) { esc = false; continue }
      if (ch === '\\') { esc = true; continue }
      if (ch === '"') { inStr = !inStr; continue }
      if (inStr) continue
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          candidates.push(text.slice(i, j + 1))
          break
        }
      }
    }
  }
  candidates.sort((a, b) => b.length - a.length)
  for (const c of candidates) {
    try { return JSON.parse(c) } catch { /* keep trying */ }
  }

  return null
}
