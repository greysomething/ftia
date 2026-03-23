import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Prompts tailored per entity type
const PROMPTS: Record<string, string> = {
  production: `You are an expert data extractor for film/TV production listings (like those in Production Weekly or similar industry tracking sheets). Analyze this screenshot and extract ALL information into the exact JSON structure below. Be thorough — extract every crew member, every company, every detail visible.

IMPORTANT FIELD MAPPING RULES:
- "production_types": Match to EXACTLY one or more of these names: "Documentary", "Feature Film", "Film", "Musicals", "Pilot", "Play", "Series", "Short Film", "Student Film", "Theater", "TV", "TV Movie", "Video Game". Pick the best match(es).
- "production_statuses": Match to EXACTLY one or more of these names: "Announced", "Casting", "Development", "Halted", "Post-Production", "Pre-production", "Production". Pick based on context clues in the listing.
- "computed_status" (production phase): Must be one of: "in-pre-production", "in-production", "in-post-production", "completed". Infer from status/dates.
- For dates, always use YYYY-MM-DD format when possible. If only month/year shown, use YYYY-MM-01.
- For locations, split into structured parts. Each location is a separate object.
- For companies, extract ALL contact details: multiple phones, faxes, emails are common.
- For crew, extract phone numbers and emails if visible next to their names.

Return ONLY valid JSON with this structure (use null for missing fields, empty arrays [] if no items):
{
  "title": "Production Title - Format (Season XX)",
  "excerpt": "One-line logline or short description",
  "content": "Longer plot/description text, network info, genre details, any other notes",
  "production_types": ["Series"],
  "production_statuses": ["Pre-production"],
  "computed_status": "in-pre-production",
  "production_date_start": "2026-07-01",
  "production_date_end": null,
  "production_date_startpost": null,
  "production_date_endpost": null,
  "locations": [
    {
      "location": "Los Angeles, CA",
      "city": "Los Angeles",
      "stage": "CA",
      "country": "United States"
    }
  ],
  "companies": [
    {
      "inline_name": "Company Name",
      "inline_address": "123 Main St, Suite 100",
      "inline_phones": ["310-555-1234", "310-555-5678"],
      "inline_faxes": ["310-555-9999"],
      "inline_emails": ["info@company.com", "production@company.com"]
    }
  ],
  "crew": [
    {
      "role_name": "Director",
      "inline_name": "John Smith",
      "inline_phones": ["310-555-0000"],
      "inline_emails": ["john@email.com"]
    },
    {
      "role_name": "Producer",
      "inline_name": "Jane Doe",
      "inline_phones": [],
      "inline_emails": []
    }
  ]
}`,

  company: `You are an expert data extractor for entertainment industry company listings. Analyze this screenshot and extract ALL company information.

Return ONLY valid JSON:
{
  "title": "Company Name",
  "address": "Full street address, City, State ZIP",
  "phone": "phone number or null",
  "fax": "fax number or null",
  "email": "email@company.com or null",
  "linkedin": "LinkedIn URL or null",
  "twitter": "Twitter handle or null",
  "content": "Description/notes about the company or null",
  "staff": [
    {
      "name": "Person Name",
      "position": "Their title/role"
    }
  ]
}`,

  crew: `You are an expert data extractor for entertainment industry crew/talent listings. Analyze this screenshot and extract the person's information.

Return ONLY valid JSON:
{
  "name": "Full Name",
  "email": "email or null",
  "phone": "phone or null",
  "linkedin": "LinkedIn URL or null",
  "twitter": "Twitter handle or null",
  "roles": ["Role 1", "Role 2"],
  "companies": ["Company affiliation 1"],
  "bio": "Description or bio text or null"
}`,

  dnw_notice: `You are an expert data extractor for SAG-AFTRA "Do Not Work" notices. Analyze this screenshot and extract the notice information.

Return ONLY valid JSON:
{
  "production_title": "Name of the production",
  "company_name": "Producer or company name (extract from text if mentioned)",
  "reason": "The reason for the DNW notice (e.g. 'Failed to initiate signatory process', 'No SAG-AFTRA contract on file')",
  "details": "Full text of the notice for reference",
  "notice_date": "YYYY-MM-DD format date shown on the notice"
}`,
}

export async function POST(req: NextRequest) {
  try {
    // Verify admin access
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ANTHROPIC_API_KEY = process.env.SCANNER_ANTHROPIC_KEY
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'SCANNER_ANTHROPIC_KEY is not configured. Add it to your .env.local file.' },
      { status: 500 }
    )
  }

  try {
    const body = await req.json()
    const { image, type } = body as { image: string; type: string }

    if (!image || !type) {
      return NextResponse.json({ error: 'Image and type are required.' }, { status: 400 })
    }

    const prompt = PROMPTS[type]
    if (!prompt) {
      return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 })
    }

    // Determine media type from base64 header
    let mediaType = 'image/png'
    if (image.startsWith('data:')) {
      const match = image.match(/^data:(image\/\w+);base64,/)
      if (match) mediaType = match[1]
    }

    // Strip data URL prefix if present
    const base64Data = image.includes(',') ? image.split(',')[1] : image

    // Call Claude API with vision
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const errData = await response.text()
      console.error('[scan-image] Claude API error:', errData)
      return NextResponse.json(
        { error: `Claude API error: ${response.status}` },
        { status: 500 }
      )
    }

    const data = await response.json()
    const textContent = data.content?.find((c: any) => c.type === 'text')?.text ?? ''

    // Extract JSON from the response (handle markdown code blocks)
    let jsonStr = textContent
    const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    const parsed = JSON.parse(jsonStr)

    return NextResponse.json({ data: parsed })
  } catch (err: any) {
    console.error('[scan-image] Error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to process image.' },
      { status: 500 }
    )
  }
}
