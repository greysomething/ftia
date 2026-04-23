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
    // LAST text block, not the first.
    const textBlocks = (result.content ?? []).filter((b: any) => b.type === 'text' && b.text)
    const text = textBlocks[textBlocks.length - 1]?.text ?? ''

    // Extract JSON from response (greedy match the outermost object)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('[ai-research] No JSON in final text block. Raw:', text.slice(0, 500))
      return NextResponse.json({ error: 'AI did not return valid JSON' }, { status: 500 })
    }

    const data = JSON.parse(jsonMatch[0])

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
