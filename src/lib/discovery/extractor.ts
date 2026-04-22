/**
 * Discovery extractor: takes a single trade-publication article and asks
 * Claude (with web search) to (1) extract structured production data and
 * (2) score its own verifiability with per-field sources.
 *
 * Output is a draft-ready ExtractedProduction matching the productions
 * schema, plus a 0–100 verifiability score that gates auto-creation.
 */

export interface ExtractedCrew {
  role_name: string
  inline_name: string
}
export interface ExtractedCompany {
  inline_name: string
  inline_address?: string
}
export interface ExtractedLocation {
  city?: string
  location?: string
  country?: string
}
export interface ExtractedField {
  value: string | null
  confidence: number     // 0–1
  source?: string        // URL or publication name
}

export interface ExtractedProduction {
  // Required
  title: string
  // Optional structured fields
  excerpt: string | null            // logline / synopsis (1-2 sentences)
  description: string | null        // 60–180 word writeup in ProductionList voice
  production_phase: 'in-pre-production' | 'in-production' | 'in-post-production' | 'completed' | null
  production_type_slug: string | null    // 'film' | 'tv' | etc — must match production_types.slug
  production_status_slug: string | null  // matches production_statuses.slug
  production_date_start: string | null
  production_date_end: string | null
  network: string | null            // network/platform/distributor
  companies: ExtractedCompany[]
  crew: ExtractedCrew[]
  locations: ExtractedLocation[]
  // Verifiability (kept for the discovery_items audit trail, NOT shown on the production)
  field_sources: Record<string, ExtractedField>  // per-field provenance
  verifiability_score: number       // 0–100 (computed from per-field confidences)
  searched_but_not_found: string[]
  notes: string                     // overall summary / caveats
}

const EXTRACTOR_MODEL = 'claude-sonnet-4-5-20250929'
const MAX_TOKENS = 4096
const WEB_SEARCH_MAX_USES = 8

const SYSTEM_PROMPT = `You are a production-tracking research assistant for ProductionList.com — a directory of active film & TV productions.

Given a single trade-publication article (Variety, Deadline, THR, etc.), extract structured production data AND honestly score how verifiable each field is using web search to cross-reference against authoritative sources.

═══════════════════════════════════════════════════════════════════════
ABSOLUTE RULES
═══════════════════════════════════════════════════════════════════════
1. Only extract data about ACTIVE film, TV, or streaming projects (development, pre-production, production, post-production). SKIP if the article is:
   - A review, recap, awards coverage, opinion piece, festival report, or interview
   - About a project that has already been released or completed
   - About casting/staffing changes for an already-completed project
   - Industry news without a specific named project
2. NEVER invent. If a field isn't in the article AND you can't verify via web search, leave it null and add the field name to "searched_but_not_found".
3. For every field you DO populate, include a "field_sources" entry with confidence (0–1) and the source URL/publication where you confirmed it.
4. Only attach people to roles you can verify they actually hold for THIS project. Don't import unrelated credits.

═══════════════════════════════════════════════════════════════════════
SCHEMA
═══════════════════════════════════════════════════════════════════════
- excerpt: a punchy 1-2 sentence logline. The plot/concept in plain language.
- description: a 60–180 word professional writeup in ProductionList.com's voice.
  See VOICE GUIDE below. This is what members see on the production page.
- production_phase: one of "in-pre-production", "in-production", "in-post-production", "completed", or null
- production_type_slug: one of "film", "tv", or null
- production_status_slug: one of "announced", "casting", "in-development", "pre-production", "production", "post-production", "completed", or null
- network: streaming platform / broadcaster / distributor (Netflix, HBO, Apple TV+, etc.) — null if unknown
- companies: production/studio companies attached. Each: { "inline_name": "..." }
- crew: key creative team. Each: { "role_name": "Director|Writer|Showrunner|Producer|...", "inline_name": "Person Name" }
- locations: each { "city": "...", "country": "USA", "location": "optional venue" }
- production_date_start / end: ISO date "YYYY-MM-DD" or null

═══════════════════════════════════════════════════════════════════════
VOICE GUIDE — for the "description" field
═══════════════════════════════════════════════════════════════════════
ProductionList.com is a directory for working film & TV professionals
(line producers, department heads, crew, casting, location managers).

Tone: Clear, warm, industry-savvy. Like a well-connected colleague
sharing a verified lead, not a press release and not trade-paper hype.
- Conversational but factual. No "is set to dazzle" / "highly anticipated"
  hype words. No "in the vein of..." comparisons.
- Continuous prose only. No bullets. No headings. No links.
- Lead with what the project IS (title, type, phase). Then key creative
  team. Then production company / network. Then locations & timeline IF
  known. Close with one short forward-looking line.
- 60–180 words. Shorter is fine if data is sparse.
- ONLY use facts from the article + your verified web search. Do not invent
  cast, credits, prior work, or comparisons. Skip anything you can't verify.
- Do NOT mention "this article", "the announcement", or trade publications by
  name. Write as the directory's editorial voice, not a recap.

EXAMPLE OF GOOD voice:
"The Secret Lives of Mormon Wives is back in production for its third
season, with Hulu continuing its docuseries deal with showrunner Jane Doe.
The new season returns to Salt Lake City, with a producing team that
includes XYZ Productions. Production is targeting an early summer 2026
shoot, with a fall premiere expected on Hulu and Disney+ internationally."

═══════════════════════════════════════════════════════════════════════
VERIFIABILITY SCORING
═══════════════════════════════════════════════════════════════════════
Use field_sources to record per-field confidence:
- 0.90–1.00 = found in 2+ authoritative sources (Variety + IMDb, etc.)
- 0.75–0.89 = found in the article AND one corroborating source
- 0.60–0.74 = in the article only, no corroboration found despite searching
- 0.40–0.59 = inferred from context (e.g. "drama" → type "tv")
- < 0.40    = do NOT include the field

Compute "verifiability_score" 0–100 as the weighted average of all populated field confidences × 100. Round to nearest integer. If there are no concrete extractable fields (the article isn't about a specific project), return score 0 and title "" — it will be filtered out.

═══════════════════════════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════════════════════════
Return ONLY a JSON object matching:
{
  "title": "Project Title",
  "excerpt": "1-2 sentence logline",
  "description": "60-180 word writeup in ProductionList voice (see VOICE GUIDE)",
  "production_phase": "in-pre-production",
  "production_type_slug": "film",
  "production_status_slug": "pre-production",
  "production_date_start": null,
  "production_date_end": null,
  "network": "Netflix",
  "companies": [{ "inline_name": "..." }],
  "crew": [{ "role_name": "Director", "inline_name": "..." }],
  "locations": [{ "city": "Atlanta", "country": "USA" }],
  "field_sources": {
    "title":   { "value": "...", "confidence": 0.95, "source": "https://..." },
    "network": { "value": "Netflix", "confidence": 0.85, "source": "Variety article" }
  },
  "verifiability_score": 87,
  "searched_but_not_found": ["production_date_start"],
  "notes": "Article confirms director attached and Netflix deal; start date not yet announced."
}

If the article is not about a specific active project, return:
{ "title": "", "verifiability_score": 0, "notes": "Not a production announcement: <reason>", "description": null, "field_sources": {}, "searched_but_not_found": [], "companies": [], "crew": [], "locations": [], "excerpt": null, "production_phase": null, "production_type_slug": null, "production_status_slug": null, "production_date_start": null, "production_date_end": null, "network": null }`

interface AnthropicContentBlock {
  type: string
  text?: string
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[]
  stop_reason?: string
  error?: { message?: string }
}

export interface ExtractInput {
  title: string
  link: string | null
  summary: string | null
}

/**
 * Run the extractor on a single discovery item. Throws on API errors.
 * Returns null if the article isn't a production announcement (caller should
 * mark as filtered_out).
 */
export async function extractProductionFromArticle(
  apiKey: string,
  input: ExtractInput,
): Promise<ExtractedProduction | null> {
  const userMessage = [
    `ARTICLE TO EXTRACT FROM:`,
    `Headline: ${input.title}`,
    input.link ? `URL: ${input.link}` : null,
    `Summary/excerpt:`,
    input.summary || '(none provided)',
    ``,
    `Visit the URL if useful, then cross-reference with web search. Return your JSON.`,
  ].filter(Boolean).join('\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: EXTRACTOR_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [
        { type: 'web_search_20250305', name: 'web_search', max_uses: WEB_SEARCH_MAX_USES },
      ],
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Extractor API error ${res.status}: ${errText.slice(0, 300)}`)
  }
  const json = (await res.json()) as AnthropicResponse
  if (json.error) throw new Error(`Extractor returned error: ${json.error.message}`)

  const textBlocks = (json.content ?? []).filter(b => b.type === 'text' && b.text)
  const finalText = textBlocks[textBlocks.length - 1]?.text ?? ''
  const jsonMatch = finalText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Extractor did not return JSON. Raw: ' + finalText.slice(0, 200))
  }

  let parsed: any
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (e: any) {
    throw new Error('Extractor returned malformed JSON: ' + e.message)
  }

  // Bail if the article isn't a production announcement
  if (!parsed.title || (parsed.verifiability_score ?? 0) === 0) {
    return null
  }

  // Normalize/clamp
  const sanitize = <T>(v: T | undefined | null): T | null => v ?? null
  return {
    title: String(parsed.title).slice(0, 200),
    excerpt: parsed.excerpt ? String(parsed.excerpt).slice(0, 800) : null,
    description: parsed.description ? String(parsed.description).slice(0, 2500) : null,
    production_phase: parsed.production_phase ?? null,
    production_type_slug: parsed.production_type_slug ?? null,
    production_status_slug: parsed.production_status_slug ?? null,
    production_date_start: parsed.production_date_start ?? null,
    production_date_end: parsed.production_date_end ?? null,
    network: parsed.network ?? null,
    companies: Array.isArray(parsed.companies) ? parsed.companies.slice(0, 10) : [],
    crew: Array.isArray(parsed.crew) ? parsed.crew.slice(0, 20) : [],
    locations: Array.isArray(parsed.locations) ? parsed.locations.slice(0, 10) : [],
    field_sources: parsed.field_sources ?? {},
    verifiability_score: Math.max(0, Math.min(100, Math.round(parsed.verifiability_score ?? 0))),
    searched_but_not_found: Array.isArray(parsed.searched_but_not_found) ? parsed.searched_but_not_found : [],
    notes: parsed.notes ? String(parsed.notes).slice(0, 1000) : '',
  }
}
