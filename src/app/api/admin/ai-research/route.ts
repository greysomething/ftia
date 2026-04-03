import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getPromptConfig } from '@/lib/ai-prompts'
import { validateResearchUrls } from '@/lib/url-validator'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

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
        messages: [
          {
            role: 'user',
            content: `${config.prompt}${contextNote}\n\nResearch this ${type}: "${name}"`,
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
    const text = result.content?.[0]?.text ?? ''

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
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
