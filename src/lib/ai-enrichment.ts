/**
 * Reusable building blocks for AI-driven company / crew enrichment.
 *
 * Two callers today:
 *   • /api/admin/ai-research + /api/admin/ai-research/apply (manual, admin-triggered)
 *     — those routes still have inline implementations for backward compatibility;
 *       new code should prefer these helpers.
 *   • /api/cron/enrich-profiles (nightly, runs without admin session)
 *
 * Keeping the logic in lib/ means the cron doesn't have to spoof an admin
 * session via internal HTTP — it just calls these functions directly with
 * the service-role supabase client.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getPromptConfig } from '@/lib/ai-prompts'
import { validateResearchUrls } from '@/lib/url-validator'
import { parsePhpSerialized } from '@/lib/utils'
import {
  collectEmailDomains,
  extractEmailDomain,
  extractWebsiteDomain,
  findCompanyByDomain,
  findCrewByDomain,
  linkCrewToCompany,
} from '@/lib/crew-company-matcher'

const WEB_SEARCH_MAX_USES = 10
export const MIN_CONFIDENCE = 0.85

export type EntityType = 'company' | 'crew'

// ── Research ─────────────────────────────────────────────────────────────────

export interface ResearchResult {
  ok: boolean
  data?: any
  error?: string
  url_validation?: { total_checked: number; total_valid: number; total_invalid: number }
}

export async function researchEntity(
  type: EntityType,
  name: string,
  existingData?: any,
): Promise<ResearchResult> {
  const apiKey = process.env.SCANNER_ANTHROPIC_KEY
  if (!apiKey) return { ok: false, error: 'SCANNER_ANTHROPIC_KEY not configured' }

  const config = await getPromptConfig(type)
  const contextNote = existingData
    ? `\n\nExisting data we already have (fill in what's MISSING, don't repeat what we have):\n${JSON.stringify(existingData, null, 2)}`
    : ''

  const searchInstruction = `\n\nUSE THE web_search TOOL. Do not rely on memory alone. Search the web for the ${type}'s official website, LinkedIn, IMDb, social profiles, and any trade press coverage. Visit at least the first relevant result for each missing field. Then return the JSON.`

  let response: Response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
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
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Network error reaching Anthropic API' }
  }

  if (!response.ok) {
    const errText = await response.text()
    let msg = `AI API returned status ${response.status}`
    try {
      const errJson = JSON.parse(errText)
      msg = errJson?.error?.message || errJson?.message || msg
    } catch {}
    return { ok: false, error: msg }
  }

  const result = await response.json()
  const textBlocks = (result.content ?? []).filter((b: any) => b.type === 'text' && b.text)
  const finalText = textBlocks[textBlocks.length - 1]?.text ?? ''
  const allText = textBlocks.map((b: any) => b.text).join('\n')
  const data = extractJson(finalText) ?? extractJson(allText)
  if (!data) {
    return { ok: false, error: `AI returned no parseable JSON. stop_reason=${result.stop_reason}` }
  }

  const { data: validated, total_checked, total_valid, total_invalid } = await validateResearchUrls(data)
  return { ok: true, data: validated, url_validation: { total_checked, total_valid, total_invalid } }
}

function extractJson(text: string): any | null {
  if (!text) return null
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) { try { return JSON.parse(fenceMatch[1].trim()) } catch {} }
  try { return JSON.parse(text.trim()) } catch {}
  const greedy = text.match(/\{[\s\S]*\}/)
  if (greedy) { try { return JSON.parse(greedy[0]) } catch {} }
  // Brace-balanced walker — keep the longest valid candidate
  const candidates: string[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue
    let depth = 0, inStr = false, esc = false
    for (let j = i; j < text.length; j++) {
      const ch = text[j]
      if (esc) { esc = false; continue }
      if (ch === '\\') { esc = true; continue }
      if (ch === '"') { inStr = !inStr; continue }
      if (inStr) continue
      if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth === 0) { candidates.push(text.slice(i, j + 1)); break } }
    }
  }
  candidates.sort((a, b) => b.length - a.length)
  for (const c of candidates) { try { return JSON.parse(c) } catch {} }
  return null
}

// ── Apply ────────────────────────────────────────────────────────────────────

type FieldMap = Record<string, { col: string; isArray?: boolean }>

const COMPANY_FIELD_MAP: FieldMap = {
  address:     { col: 'addresses', isArray: true },
  phone:       { col: 'phones',    isArray: true },
  email:       { col: 'emails',    isArray: true },
  website:     { col: 'website' },
  linkedin:    { col: 'linkedin' },
  twitter:     { col: 'twitter' },
  instagram:   { col: 'instagram' },
  description: { col: 'content' },
}

const CREW_FIELD_MAP: FieldMap = {
  email:     { col: 'emails', isArray: true },
  phone:     { col: 'phones', isArray: true },
  website:   { col: 'website' },
  linkedin:  { col: 'linkedin' },
  twitter:   { col: 'twitter' },
  instagram: { col: 'instagram' },
  imdb:      { col: 'imdb' },
  profile_image_url: { col: 'profile_image_url' },
  bio:       { col: 'content' },
  location:  { col: 'location' },
  known_for:      { col: 'known_for' },
  representation: { col: 'representation' },
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) {
    if (value.length === 0) return true
    const cleaned = parsePhpSerialized(value)
    return cleaned.length === 0 || cleaned.every(s => !s || !String(s).trim())
  }
  if (typeof value === 'object') return Object.keys(value as object).length === 0
  return false
}

export interface ApplyResult {
  ok: boolean
  error?: string
  applied_count: number
  applied: Record<string, any>
  skipped_existing: string[]
  low_confidence: string[]
  needs_review: Record<string, { value: any; confidence: number }>
  confidence_avg: number | null
  links_created: Array<{ company_id: number; crew_id: number; via: string }>
  last_enriched_at: string
}

export async function applyResearch(
  supabase: SupabaseClient,
  type: EntityType,
  id: number,
  data: any,
): Promise<ApplyResult> {
  const table = type === 'company' ? 'companies' : 'crew_members'
  const fieldMap = type === 'company' ? COMPANY_FIELD_MAP : CREW_FIELD_MAP

  const { data: current, error: loadErr } = await supabase
    .from(table)
    .select('*')
    .eq('id', id)
    .single()

  if (loadErr || !current) {
    return {
      ok: false,
      error: loadErr?.message ?? 'Record not found',
      applied_count: 0, applied: {}, skipped_existing: [], low_confidence: [],
      needs_review: {}, confidence_avg: null, links_created: [],
      last_enriched_at: new Date().toISOString(),
    }
  }

  const meta = (data.field_metadata ?? {}) as Record<string, { confidence?: number }>
  const applied: Record<string, any> = {}
  const skippedExisting: string[] = []
  const lowConfidence: string[] = []
  const needsReview: Record<string, { value: any; confidence: number }> = {}
  const acceptedConfidences: number[] = []

  for (const [aiField, mapping] of Object.entries(fieldMap)) {
    const aiValue = data[aiField]
    if (aiValue == null || (Array.isArray(aiValue) && aiValue.length === 0)) continue
    if (typeof aiValue === 'string' && aiValue.trim() === '') continue

    const confidence = typeof meta[aiField]?.confidence === 'number' ? meta[aiField].confidence! : 0
    const existing = current[mapping.col]
    const dbValue = mapping.isArray
      ? [String(aiValue).trim()]
      : (typeof aiValue === 'string' ? aiValue.trim() : aiValue)

    if (!isEmpty(existing)) {
      if (confidence >= MIN_CONFIDENCE) {
        needsReview[aiField] = { value: aiValue, confidence }
      }
      skippedExisting.push(aiField)
      continue
    }

    if (confidence >= MIN_CONFIDENCE) {
      applied[mapping.col] = dbValue
      acceptedConfidences.push(confidence)
    } else {
      lowConfidence.push(aiField)
      needsReview[aiField] = { value: aiValue, confidence }
    }
  }

  const lastEnrichedAt = new Date().toISOString()
  const updatePayload: Record<string, any> = { ...applied, last_enriched_at: lastEnrichedAt }

  const { error: updateErr } = await supabase.from(table).update(updatePayload).eq('id', id)
  if (updateErr) {
    return {
      ok: false, error: updateErr.message,
      applied_count: 0, applied: {}, skipped_existing: skippedExisting, low_confidence: lowConfidence,
      needs_review: needsReview, confidence_avg: null, links_created: [],
      last_enriched_at: lastEnrichedAt,
    }
  }

  // Domain-match auto-linking — bonus, never aborts the enrichment
  const linksCreated: Array<{ company_id: number; crew_id: number; via: string }> = []
  try {
    if (type === 'crew') {
      const newEmail = Array.isArray(applied.emails) ? applied.emails[0] : null
      const domain = extractEmailDomain(newEmail)
      if (domain) {
        const company = await findCompanyByDomain(supabase, domain)
        if (company) {
          const created = await linkCrewToCompany(supabase, company.id, id)
          if (created) linksCreated.push({ company_id: company.id, crew_id: id, via: `email-domain ${domain}` })
        }
      }
    } else {
      const domains = new Set<string>()
      const websiteDomain = extractWebsiteDomain(applied.website ?? null)
      if (websiteDomain) domains.add(websiteDomain)
      for (const d of collectEmailDomains(applied.emails)) domains.add(d)
      for (const domain of domains) {
        const crewList = await findCrewByDomain(supabase, domain)
        for (const crew of crewList) {
          const created = await linkCrewToCompany(supabase, id, crew.id)
          if (created) linksCreated.push({ company_id: id, crew_id: crew.id, via: `crew-domain ${domain}` })
        }
      }
    }
  } catch (linkErr: any) {
    console.warn('[ai-enrichment] auto-link failed (non-fatal):', linkErr?.message ?? linkErr)
  }

  const confidenceAvg = acceptedConfidences.length > 0
    ? acceptedConfidences.reduce((a, b) => a + b, 0) / acceptedConfidences.length
    : null

  return {
    ok: true,
    applied_count: Object.keys(applied).length,
    applied,
    skipped_existing: skippedExisting,
    low_confidence: lowConfidence,
    needs_review: needsReview,
    confidence_avg: confidenceAvg,
    links_created: linksCreated,
    last_enriched_at: lastEnrichedAt,
  }
}
