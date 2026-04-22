/**
 * Profile-completeness scoring for Companies and Crew.
 *
 * Returns a 0–100 score + the list of missing fields so admin pages can
 * surface a colored pill and (eventually) drive AI enrichment priorities.
 *
 * Compute-on-read by design — we call these helpers inside admin queries so
 * tweaking the weights doesn't require a migration or a backfill.
 *
 * Field values in the DB are a mix of clean arrays and legacy PHP-serialized
 * strings from the WordPress migration, so we normalize through
 * `parsePhpSerialized` before checking "is it filled".
 */

import { parsePhpSerialized } from '@/lib/utils'

export interface CompletenessResult {
  score: number         // 0–100
  missing: string[]     // human-readable labels of empty fields
  bucket: 'red' | 'amber' | 'green'
}

function bucket(score: number): CompletenessResult['bucket'] {
  if (score >= 75) return 'green'
  if (score >= 40) return 'amber'
  return 'red'
}

// ── helpers ──────────────────────────────────────────────────────────────

function hasArrayValue(raw: any): boolean {
  return parsePhpSerialized(raw).length > 0
}

function hasStringValue(raw: any, minLen = 1): boolean {
  if (raw == null) return false
  const s = String(raw).trim()
  return s.length >= minLen
}

// ── Companies ────────────────────────────────────────────────────────────

export interface CompanyForScoring {
  addresses?: any
  phones?: any
  emails?: any
  website?: string | null
  linkedin?: string | null
  twitter?: string | null
  instagram?: string | null
  content?: string | null
  staff_count?: number | null
}

const COMPANY_WEIGHTS = [
  { key: 'addresses', label: 'Address',    weight: 15, test: (c: CompanyForScoring) => hasArrayValue(c.addresses) },
  { key: 'phones',    label: 'Phone',      weight: 15, test: (c: CompanyForScoring) => hasArrayValue(c.phones) },
  { key: 'emails',    label: 'Email',      weight: 15, test: (c: CompanyForScoring) => hasArrayValue(c.emails) },
  { key: 'website',   label: 'Website',    weight: 15, test: (c: CompanyForScoring) => hasStringValue(c.website) },
  { key: 'linkedin',  label: 'LinkedIn',   weight: 8,  test: (c: CompanyForScoring) => hasStringValue(c.linkedin) },
  { key: 'twitter',   label: 'Twitter',    weight: 7,  test: (c: CompanyForScoring) => hasStringValue(c.twitter) },
  { key: 'instagram', label: 'Instagram',  weight: 7,  test: (c: CompanyForScoring) => hasStringValue(c.instagram) },
  { key: 'content',   label: 'Description', weight: 10, test: (c: CompanyForScoring) => hasStringValue(c.content, 40) },
  { key: 'staff',     label: 'Staff links', weight: 8, test: (c: CompanyForScoring) => (c.staff_count ?? 0) > 0 },
] as const

export function scoreCompany(c: CompanyForScoring): CompletenessResult {
  let score = 0
  const missing: string[] = []
  for (const f of COMPANY_WEIGHTS) {
    if (f.test(c)) score += f.weight
    else missing.push(f.label)
  }
  return { score: Math.min(100, score), missing, bucket: bucket(score) }
}

// ── Crew ─────────────────────────────────────────────────────────────────

export interface CrewForScoring {
  emails?: any
  phones?: any
  roles?: any
  location?: string | null
  website?: string | null
  linkedin?: string | null
  imdb?: string | null
  twitter?: string | null
  instagram?: string | null
  content?: string | null
  company_link_count?: number | null
}

const CREW_WEIGHTS = [
  { key: 'emails',    label: 'Email',     weight: 15, test: (c: CrewForScoring) => hasArrayValue(c.emails) },
  { key: 'phones',    label: 'Phone',     weight: 15, test: (c: CrewForScoring) => hasArrayValue(c.phones) },
  { key: 'roles',     label: 'Roles',     weight: 10, test: (c: CrewForScoring) => hasArrayValue(c.roles) },
  { key: 'location',  label: 'Location',  weight: 10, test: (c: CrewForScoring) => hasStringValue(c.location) },
  { key: 'website',   label: 'Website',   weight: 10, test: (c: CrewForScoring) => hasStringValue(c.website) },
  { key: 'linkedin',  label: 'LinkedIn',  weight: 10, test: (c: CrewForScoring) => hasStringValue(c.linkedin) },
  { key: 'imdb',      label: 'IMDb',      weight: 8,  test: (c: CrewForScoring) => hasStringValue(c.imdb) },
  { key: 'twitter',   label: 'Twitter',   weight: 6,  test: (c: CrewForScoring) => hasStringValue(c.twitter) },
  { key: 'instagram', label: 'Instagram', weight: 6,  test: (c: CrewForScoring) => hasStringValue(c.instagram) },
  { key: 'content',   label: 'Bio',       weight: 5,  test: (c: CrewForScoring) => hasStringValue(c.content, 40) },
  { key: 'company',   label: 'Company link', weight: 5, test: (c: CrewForScoring) => (c.company_link_count ?? 0) > 0 },
] as const

export function scoreCrew(c: CrewForScoring): CompletenessResult {
  let score = 0
  const missing: string[] = []
  for (const f of CREW_WEIGHTS) {
    if (f.test(c)) score += f.weight
    else missing.push(f.label)
  }
  return { score: Math.min(100, score), missing, bucket: bucket(score) }
}
