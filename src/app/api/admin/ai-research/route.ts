import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const COMPANY_PROMPT = `You are an expert entertainment industry researcher. Given a production company name, research and provide all available information about this company.

Return ONLY valid JSON with this structure (use null for unknown fields, empty arrays [] if no items):
{
  "address": "Full street address, city, state/province, zip, country",
  "phone": "Main phone number",
  "fax": "Fax number if known",
  "email": "General or HR email address",
  "website": "Company website URL",
  "linkedin": "LinkedIn company page URL",
  "twitter": "Twitter/X handle (with @)",
  "instagram": "Instagram handle",
  "imdb": "IMDb company page URL",
  "description": "Brief 2-3 sentence description of the company, what they produce, their notable projects",
  "parent_company": "Parent company name if applicable",
  "key_staff": [
    { "name": "Person Name", "position": "Title/Role", "email": null, "phone": null }
  ],
  "notable_projects": ["Project Name 1", "Project Name 2"],
  "genres": ["Drama", "Comedy"],
  "headquarters_city": "City name",
  "headquarters_country": "Country name",
  "founded_year": 2005
}

IMPORTANT: Only include information you are confident about. Use null for anything uncertain. Do NOT fabricate contact details — only include real, verifiable information. For major studios and well-known companies, you should know their headquarters address, main phone, website, and key executives. For smaller companies, provide what you can.`

const CREW_PROMPT = `You are an expert entertainment industry researcher. Given a person's name who works in film/television, research and provide all available information about them.

Return ONLY valid JSON with this structure (use null for unknown fields, empty arrays [] if no items):
{
  "email": "Professional email if publicly known",
  "phone": "Contact phone if publicly known",
  "website": "Personal or professional website URL",
  "linkedin": "LinkedIn profile URL",
  "twitter": "Twitter/X handle (with @)",
  "instagram": "Instagram handle",
  "imdb": "IMDb name page URL",
  "bio": "Brief 2-3 sentence professional bio — their specialization, career highlights, notable work",
  "primary_role": "Their primary industry role (e.g. Director, Producer, Cinematographer)",
  "additional_roles": ["Other roles they perform"],
  "known_for": ["Notable Film 1", "Notable Series 1"],
  "companies": ["Company they are associated with or founded"],
  "representation": {
    "agency": "Talent agency name",
    "agent": "Agent name if known",
    "manager": "Manager name if known"
  },
  "location": "City/region they primarily work from",
  "awards": ["Notable award 1"]
}

IMPORTANT: Only include information you are confident about. Use null for anything uncertain. Do NOT fabricate contact details — only include real, publicly available information. For well-known industry professionals, you should know their key credits, primary role, and representation. For less known individuals, provide what you can.`

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

  const prompt = type === 'company' ? COMPANY_PROMPT : CREW_PROMPT
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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: `${prompt}${contextNote}\n\nResearch this ${type}: "${name}"`,
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
