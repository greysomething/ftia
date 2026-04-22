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
- For locations, focus on filling "city", "stage" (state/province abbreviation), and "country" fields. Leave "location" blank unless there is a specific place name (e.g. a studio name, venue, or address). Each location is a separate object.
- For companies, extract ALL contact details: multiple phones, faxes, emails are common.
- For addresses, format cleanly: spell out abbreviations (Bldg. → Building, Ste. → Suite), use ordinal numbers (Fourth Floor → 4th Floor), no comma before ZIP code (Los Angeles, CA 90064 not Los Angeles, CA, 90064), no trailing periods on abbreviations (Blvd not Blvd.).
- For crew, extract phone numbers and emails if visible next to their names.
- For crew roles, use the full role name without abbreviations. For example: "POC" → "Production Coordinator", "UPM" → "Unit Production Manager", "AD" → "Assistant Director", "DP" → "Director of Photography", "EP" → "Executive Producer", "LP" → "Line Producer", "CD" → "Casting Director", "PD" → "Production Designer".
- TITLE CASING: If the production title in the source is in ALL CAPS or has inconsistent casing, normalize it to standard Title Case (capitalize the first letter of each significant word). For example: "LIZARD MUSIC - Feature Film" → "Lizard Music - Feature Film", "THE LAST OF US" → "The Last of Us", "BREAKING BAD: SEASON 2" → "Breaking Bad: Season 2". Keep small words (a, an, the, and, but, or, for, nor, of, on, in, to, with, at, by, from) lowercase UNLESS they are the first word of the title or subtitle. Preserve genuine acronyms and initialisms in uppercase (e.g. "NYC", "FBI", "CIA", "NASA", "UFO", "MTV", "HBO", "CSI", "NCIS", "SVU", "JFK"). Preserve Roman numerals in uppercase (e.g. "II", "III", "IV"). Preserve intentionally stylized casing if the title is clearly a brand (e.g. "iCarly", "WALL-E", "M*A*S*H"). The same rule applies to the "excerpt" field — write it in normal sentence case, not ALL CAPS.
- TITLE CLEAN-UP (STRIP UPDATE TAGS): Source listings often append parentheticals that describe a posting UPDATE rather than the production itself — e.g. "(New Roles)", "(New Specs for Jasmine)", "(Date and Spec Change for Young Jackie)", "(Casting Update)", "(Role Update)", "(Revised)", "(Update)", "(Updated Dates)", "(New Dates)", "(Recasting)", "(Rewrite)". REMOVE these from the title entirely — they are editorial/posting metadata, not part of the production's identity. Examples: "Spoiled Roots (New Roles)" → "Spoiled Roots"; "The One (Date and Spec Change for Young Jackie) - Feature Film" → "The One - Feature Film"; "Three Point Contest (New Specs for Jasmine) - Feature Film" → "Three Point Contest - Feature Film". Keep parentheticals that are part of the actual title (e.g. alternate titles, translations, working titles denoted as "(working title)", or numbered sequels like "(Part 2)"). When in doubt: if the parenthetical mentions a role name, a cast member's name, "specs", "update", "revised", "recast", or "new" followed by a work-product noun ("roles", "specs", "dates"), STRIP it.

CONTENT/DESCRIPTION RULES:
- The "content" field should ONLY contain information about the project itself: plot synopsis, storyline, what the show/film is about, where and when it's filming, and who is producing it.
- Do NOT include metadata like "Type: Television", "Network: ABC", "Genres: Crime / Drama", "Status: Active Development", "Added: August 07, 2023", "Last Update: March 18, 2026" in the content field. That information belongs in the structured fields (production_types, production_statuses, etc.).
- Do NOT copy posting dates, update dates, or source publication metadata into content.
- Do NOT include casting-call / talent-recruitment language in the content field. Specifically EXCLUDE any sentences about: who the production is hiring or seeking, local-hire restrictions ("local talent only in Toronto/GTA", "must reside in NY"), union/non-union status for actors, audition details, rates of pay or per diem for performers, compensation amounts ("$100/day flat rate"), nudity, intimacy, simulated sex, kissing or other physical-content advisories aimed at actors, diversity/inclusion notes about who may audition (e.g. "LGBTQ+ positive project", "seeking BIPOC actors"), age ranges for casting, or any phrase that reads like a casting breakdown rather than a description of the project. Plot-level mentions of romance, identity, or relationships are fine — only EXCLUDE the recruitment-facing framing.
- The "excerpt" should be a clean one-line logline about the project. Apply the same casting-exclusion rule to the excerpt.

Return ONLY valid JSON with this structure (use null for missing fields, empty arrays [] if no items):
{
  "title": "Production Title - Format (Season XX)",
  "excerpt": "One-line logline or short description",
  "content": "Plot synopsis, filming details, and production notes about the project itself",
  "production_types": ["Series"],
  "production_statuses": ["Pre-production"],
  "computed_status": "in-pre-production",
  "production_date_start": "2026-07-01",
  "production_date_end": null,
  "production_date_startpost": null,
  "production_date_endpost": null,
  "locations": [
    {
      "location": "",
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
    const { image, images, type } = body as { image?: string; images?: string[]; type: string }

    // Accept either a single `image` (legacy) or an `images` array (multi-screenshot stitching)
    const imageList: string[] = Array.isArray(images) && images.length > 0
      ? images
      : (image ? [image] : [])

    if (imageList.length === 0 || !type) {
      return NextResponse.json({ error: 'Image(s) and type are required.' }, { status: 400 })
    }

    if (imageList.length > 8) {
      return NextResponse.json({ error: 'Maximum 8 images per scan.' }, { status: 400 })
    }

    const prompt = PROMPTS[type]
    if (!prompt) {
      return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 })
    }

    // Build image content blocks (one per source image), all from the same listing
    const imageBlocks = imageList.map(img => {
      let mediaType = 'image/png'
      if (img.startsWith('data:')) {
        const match = img.match(/^data:(image\/\w+);base64,/)
        if (match) mediaType = match[1]
      }
      const base64Data = img.includes(',') ? img.split(',')[1] : img
      return {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: mediaType,
          data: base64Data,
        },
      }
    })

    // When multiple images are provided, prepend a stitching hint so the model
    // merges them into ONE production rather than treating each as separate.
    const stitchPreface = imageList.length > 1
      ? `IMPORTANT: The following ${imageList.length} images are screenshots of the SAME production listing — likely captured because the listing did not fit on a single screen. Treat them as ONE continuous source. Merge all crew, companies, locations, dates, and details across the screenshots into a SINGLE production record. Do NOT return multiple productions and do NOT duplicate entries that appear on more than one screenshot.\n\n`
      : ''

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
              ...imageBlocks,
              {
                type: 'text',
                text: stitchPreface + prompt,
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
