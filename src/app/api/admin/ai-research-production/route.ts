import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const RESEARCH_PROMPT = `You are an expert entertainment industry researcher with access to comprehensive knowledge of film and television productions. Given a production title and any known details, conduct exhaustive research to find ALL available information.

RESEARCH SOURCES TO CHECK (be thorough across all):

**Trade outlets & portals:**
- Production Weekly, Deadline, Variety Insight, The Hollywood Reporter, IMDbPro, The Ankler, Backstage, Studio System

**Trade journals & official outlets:**
- Variety, THR, Deadline feature articles, official press releases from studios, distributors, attached talent

**Film jurisdictions & commission websites:**
- Ontario Creates, Creative BC (Canada), Toronto Film Office, Screen Australia, British Film Commission
- Ireland Film Commission / IFTN, New York State Film Office, New Mexico Film Office
- California Film Commission, Mississippi Film Office, AFAR (France)
- Any relevant U.S. state, Canadian province, U.K., or international fund/permit registries

**Other reputable databases:**
- Studio Daily, Production Intelligence, Film LA, Casting Society of America notices, National Film Registry

IMPORTANT RULES:
- Only include information you are confident about (90%+ confidence for "confirmed", 70-89% for "likely", 50-69% for "rumored")
- Do NOT fabricate any information — only report what you genuinely know or can reasonably infer
- For each piece of information, indicate your confidence level
- Include citations/sources where you know them
- If you cannot find information for a field, set it to null — do not guess
- Before concluding "no info found," verify across EACH source above

Return ONLY valid JSON with this structure:
{
  "title": "Full production title with format/season if applicable",
  "synopsis": "1-3 sentence plot synopsis or description",
  "production_types": ["Series"],
  "production_statuses": ["Pre-production"],
  "computed_status": "in-pre-production",
  "production_date_start": "YYYY-MM-DD or null",
  "production_date_end": "YYYY-MM-DD or null",
  "network_or_studio": "Network, studio, or streamer name",
  "genres": ["Drama", "Crime"],
  "locations": [
    {
      "location": "Full location string",
      "city": "City",
      "stage": "State/Province",
      "country": "Country",
      "confidence": 0.9,
      "source": "Source where found"
    }
  ],
  "companies": [
    {
      "inline_name": "Company Name",
      "role": "Production Company | Distributor | Studio",
      "inline_address": "Address if known",
      "inline_phones": ["phone"],
      "inline_emails": ["email"],
      "confidence": 0.9,
      "source": "Source"
    }
  ],
  "crew": [
    {
      "role_name": "Director",
      "inline_name": "Person Name",
      "inline_phones": [],
      "inline_emails": [],
      "confidence": 0.95,
      "status": "confirmed | rumored",
      "source": "Source"
    }
  ],
  "additional_notes": "Any other relevant details not captured above (budget, awards buzz, related projects, etc.)",
  "searched_but_not_found": ["list of specific things searched for but not found"]
}`

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.SCANNER_ANTHROPIC_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI API key not configured (SCANNER_ANTHROPIC_KEY)' }, { status: 500 })
  }

  const { title, existingData } = await req.json()
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const contextNote = existingData
    ? `\n\nWe already have these details from a screenshot scan (fill in what's MISSING, verify what we have, add confidence levels):\n${JSON.stringify(existingData, null, 2)}`
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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: `${RESEARCH_PROMPT}${contextNote}\n\nResearch this production: "${title}"`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('[ai-research-production] API error:', err)
      return NextResponse.json({ error: `AI API error: ${response.status}` }, { status: 500 })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text ?? ''

    // Extract JSON from response
    let jsonStr = text
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    } else {
      const braceMatch = text.match(/\{[\s\S]*\}/)
      if (braceMatch) jsonStr = braceMatch[0]
    }

    const data = JSON.parse(jsonStr)
    return NextResponse.json({ ok: true, data })
  } catch (err: any) {
    console.error('[ai-research-production] Error:', err)
    return NextResponse.json({ error: err.message ?? 'AI research failed' }, { status: 500 })
  }
}
