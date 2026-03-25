import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const COMPANY_PROMPT = `You are an expert entertainment industry researcher. Given a production company name, conduct a thorough research and provide ALL available information about this company.

Return ONLY valid JSON with this structure (use null for unknown fields, empty arrays [] if no items):
{
  "address": "Full street address, city, state/province, zip, country",
  "phone": "Main phone number with area code",
  "fax": "Fax number if known",
  "email": "General contact, info@, or HR email address — check the company website contact page",
  "website": "Company website URL — search thoroughly, most production companies have websites",
  "linkedin": "LinkedIn company page URL (format: https://linkedin.com/company/company-name)",
  "twitter": "Twitter/X handle (with @) — search for official accounts",
  "instagram": "Instagram handle — search for official accounts",
  "imdb": "IMDb company page URL (format: https://www.imdb.com/company/coXXXXXXX/)",
  "description": "Brief 2-3 sentence description of the company, what they produce, their notable projects",
  "parent_company": "Parent company name if applicable",
  "key_staff": [
    { "name": "Person Name", "position": "Title/Role", "confidence": 0.95, "email": null, "phone": null }
  ],
  "notable_projects": ["Project Name 1", "Project Name 2"],
  "genres": ["Drama", "Comedy"],
  "headquarters_city": "City name",
  "headquarters_country": "Country name",
  "founded_year": 2005,
  "searched_but_not_found": ["list of fields you searched for but could not find, e.g. 'email', 'linkedin'"]
}

IMPORTANT:
- Be THOROUGH — search exhaustively for website, LinkedIn, Twitter/X, Instagram, and IMDb pages. Most entertainment companies have at least a website and IMDb page.
- For LinkedIn, try common URL patterns: linkedin.com/company/company-name, linkedin.com/company/companyname
- For Twitter/X, try the company's common name and abbreviations
- Only include information you are confident about. Use null for anything uncertain.
- Do NOT fabricate contact details — only include real, verifiable information.
- For major studios and well-known companies, you should know their headquarters address, main phone, website, and key executives.
- For smaller companies, provide what you can.
- Include "searched_but_not_found" array listing fields you actively searched for but could not find (e.g. ["email", "instagram"]) — this helps admins know the AI tried.
- For each key_staff entry, include a "confidence" score from 0.0 to 1.0:
  - 0.9-1.0 = Very confident (well-known public figure in this role, easily verifiable)
  - 0.7-0.89 = Confident (found in multiple sources, likely current)
  - 0.5-0.69 = Moderate (found but may be outdated or uncertain role)
  - Below 0.5 = Low confidence (do not include, skip this person instead)`

const CREW_PROMPT = `You are an expert entertainment industry researcher. Given a person's name who works in film/television, conduct a THOROUGH research and provide ALL available information about them.

Return ONLY valid JSON with this structure (use null for unknown fields, empty arrays [] if no items):
{
  "email": "Professional or business email address — check their personal website contact page, production company websites, or publicly listed contact info",
  "phone": "Contact phone number if publicly available — check business listings, personal websites",
  "website": "Personal website, portfolio site, or production company website URL — search thoroughly, many industry professionals have personal sites",
  "linkedin": "LinkedIn profile URL (format: https://linkedin.com/in/person-name) — try common URL patterns",
  "twitter": "Twitter/X handle (with @) — search for their official account",
  "instagram": "Instagram handle — search for their official account",
  "imdb": "IMDb name page URL (format: https://www.imdb.com/name/nmXXXXXXX/) — most working professionals have an IMDb page",
  "bio": "Brief 2-3 sentence professional bio — their specialization, career highlights, notable work",
  "primary_role": "Their primary industry role (e.g. Director, Producer, Cinematographer, Production Designer)",
  "additional_roles": ["Other roles they perform"],
  "known_for": ["Notable Film 1", "Notable Series 1", "Notable Film 2"],
  "companies": ["Production company they are associated with, work for, or founded"],
  "representation": {
    "agency": "Talent agency name (e.g. CAA, WME, UTA, ICM, Gersh)",
    "agent": "Agent name if known",
    "manager": "Manager or management company name if known"
  },
  "location": "City/region they primarily work from (e.g. Los Angeles, CA / New York, NY / Atlanta, GA / London, UK)",
  "awards": ["Notable award 1", "Nomination 1"],
  "searched_but_not_found": ["list of fields you searched for but could not find, e.g. 'email', 'linkedin', 'website'"]
}

IMPORTANT:
- Be THOROUGH — search exhaustively for personal/business website, LinkedIn profile, Twitter/X, Instagram, and IMDb page. Most working film/TV professionals have at least an IMDb page and often a LinkedIn profile.
- For LinkedIn, try common URL patterns: linkedin.com/in/firstname-lastname, linkedin.com/in/firstnamelastname
- For websites, check if they have a personal portfolio site, production company site, or are listed on a company's team page
- For email, check their personal website contact page, company website, or any publicly listed contact info
- For representation, check major agency databases and talent listings
- Only include information you are confident about. Use null for anything uncertain.
- Do NOT fabricate contact details — only include real, publicly available information.
- For well-known industry professionals, you should know their key credits, primary role, representation, and IMDb page.
- Include "searched_but_not_found" array listing fields you actively searched for but could not find (e.g. ["email", "instagram", "website"]) — this helps admins know the AI tried.
- For known_for, include their most notable/recognizable credits (up to 5-6 titles).`

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
