import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getPromptConfig } from '@/lib/ai-prompts'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
      const err = await response.text()
      return NextResponse.json({ error: `AI API error: ${err}` }, { status: 500 })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text ?? ''

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AI did not return valid JSON' }, { status: 500 })
    }

    const data = JSON.parse(jsonMatch[0])
    return NextResponse.json({ ok: true, data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'AI research failed' }, { status: 500 })
  }
}
