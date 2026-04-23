/**
 * Helpers for the nightly enrichment cron — finds the worst-scoring profiles
 * that haven't been touched recently and returns a prioritized work queue.
 *
 * Strategy:
 *   1. Pull a candidate pool of `target_pool` rows where:
 *        visibility = 'publish'
 *        AND (last_enriched_at IS NULL OR last_enriched_at < cutoff)
 *      Prefer never-enriched first, then oldest enriched.
 *   2. Score each row with `scoreCompany` / `scoreCrew`.
 *   3. Return the lowest `batch_size` scores — these get the AI call.
 *
 * We intentionally pull a larger pool than `batch_size` (10x) so the picker
 * can choose the truly-worst rows rather than just the first N matching rows
 * in some arbitrary order. The query is cheap; the AI calls are not.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { scoreCompany, scoreCrew } from '@/lib/completeness'

export interface EnrichmentCandidate {
  type: 'company' | 'crew'
  id: number
  name: string
  score: number
  missing: string[]
  last_enriched_at: string | null
}

interface FindOpts {
  batch_size: number
  target_companies: boolean
  target_crew: boolean
  min_days_between_runs: number
}

const POOL_MULTIPLIER = 10  // pull 10x batch_size, score, slice

export async function findEnrichmentCandidates(
  supabase: SupabaseClient,
  opts: FindOpts,
): Promise<EnrichmentCandidate[]> {
  const cutoffIso = new Date(Date.now() - opts.min_days_between_runs * 24 * 60 * 60 * 1000).toISOString()
  const poolSize = Math.max(opts.batch_size, opts.batch_size * POOL_MULTIPLIER)

  const tasks: Promise<EnrichmentCandidate[]>[] = []
  if (opts.target_companies) tasks.push(fetchCompanyCandidates(supabase, cutoffIso, poolSize))
  if (opts.target_crew)      tasks.push(fetchCrewCandidates(supabase, cutoffIso, poolSize))

  const pools = await Promise.all(tasks)
  const combined = pools.flat()

  // Sort by score ascending (worst first), tiebreak by oldest enrichment.
  combined.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    const aTs = a.last_enriched_at ? Date.parse(a.last_enriched_at) : 0
    const bTs = b.last_enriched_at ? Date.parse(b.last_enriched_at) : 0
    return aTs - bTs
  })

  return combined.slice(0, opts.batch_size)
}

async function fetchCompanyCandidates(
  supabase: SupabaseClient,
  cutoffIso: string,
  poolSize: number,
): Promise<EnrichmentCandidate[]> {
  const { data, error } = await supabase
    .from('companies')
    .select(`
      id, title, last_enriched_at,
      addresses, phones, emails, website, linkedin, twitter, instagram, content,
      company_staff(count)
    `)
    .eq('visibility', 'publish')
    .or(`last_enriched_at.is.null,last_enriched_at.lt.${cutoffIso}`)
    // never-enriched first (NULL sorts depends on db; explicit ordering below is fine for our pool)
    .order('last_enriched_at', { ascending: true, nullsFirst: true })
    .limit(poolSize)

  if (error) {
    console.error('[enrichment-queries] company fetch failed:', error.message)
    return []
  }

  return (data ?? []).map((row: any) => {
    const staffCount = Array.isArray(row.company_staff) && row.company_staff[0]?.count
      ? Number(row.company_staff[0].count)
      : 0
    const result = scoreCompany({
      addresses: row.addresses,
      phones: row.phones,
      emails: row.emails,
      website: row.website,
      linkedin: row.linkedin,
      twitter: row.twitter,
      instagram: row.instagram,
      content: row.content,
      staff_count: staffCount,
    })
    return {
      type: 'company' as const,
      id: row.id,
      name: row.title,
      score: result.score,
      missing: result.missing,
      last_enriched_at: row.last_enriched_at,
    }
  })
}

async function fetchCrewCandidates(
  supabase: SupabaseClient,
  cutoffIso: string,
  poolSize: number,
): Promise<EnrichmentCandidate[]> {
  const { data, error } = await supabase
    .from('crew_members')
    .select(`
      id, name, last_enriched_at,
      emails, phones, roles, location, website, linkedin, twitter, instagram, imdb, content,
      company_staff(count)
    `)
    .eq('visibility', 'publish')
    .or(`last_enriched_at.is.null,last_enriched_at.lt.${cutoffIso}`)
    .order('last_enriched_at', { ascending: true, nullsFirst: true })
    .limit(poolSize)

  if (error) {
    console.error('[enrichment-queries] crew fetch failed:', error.message)
    return []
  }

  return (data ?? []).map((row: any) => {
    const linkCount = Array.isArray(row.company_staff) && row.company_staff[0]?.count
      ? Number(row.company_staff[0].count)
      : 0
    const result = scoreCrew({
      emails: row.emails,
      phones: row.phones,
      roles: row.roles,
      location: row.location,
      website: row.website,
      linkedin: row.linkedin,
      twitter: row.twitter,
      instagram: row.instagram,
      imdb: row.imdb,
      content: row.content,
      company_link_count: linkCount,
    })
    return {
      type: 'crew' as const,
      id: row.id,
      name: row.name,
      score: result.score,
      missing: result.missing,
      last_enriched_at: row.last_enriched_at,
    }
  })
}

// ── Stats for the admin dashboard ────────────────────────────────────────────

export interface EnrichmentRunSummary {
  date: string                // YYYY-MM-DD
  total: number
  updated: number
  skipped: number
  errors: number
  fields_updated_total: number
}

export async function getRecentEnrichmentRuns(
  supabase: SupabaseClient,
  days = 30,
) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('enrichment_runs')
    .select('*')
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(500)
  if (error) {
    console.error('[enrichment-queries] runs fetch failed:', error.message)
    return []
  }
  return data ?? []
}

export async function getEnrichmentDailySummary(
  supabase: SupabaseClient,
  days = 30,
): Promise<EnrichmentRunSummary[]> {
  const runs = await getRecentEnrichmentRuns(supabase, days)
  const byDay = new Map<string, EnrichmentRunSummary>()
  for (const r of runs) {
    const day = String(r.started_at).slice(0, 10)
    let s = byDay.get(day)
    if (!s) {
      s = { date: day, total: 0, updated: 0, skipped: 0, errors: 0, fields_updated_total: 0 }
      byDay.set(day, s)
    }
    s.total++
    if (r.status === 'updated') s.updated++
    else if (r.status === 'skipped') s.skipped++
    else if (r.status === 'error') s.errors++
    s.fields_updated_total += Number(r.fields_updated ?? 0)
  }
  return Array.from(byDay.values()).sort((a, b) => b.date.localeCompare(a.date))
}

export async function getEnrichmentTotals(supabase: SupabaseClient) {
  const [companiesTotal, crewTotal, companiesEnriched, crewEnriched] = await Promise.all([
    supabase.from('companies').select('*', { count: 'exact', head: true }).eq('visibility', 'publish'),
    supabase.from('crew_members').select('*', { count: 'exact', head: true }).eq('visibility', 'publish'),
    supabase.from('companies').select('*', { count: 'exact', head: true })
      .eq('visibility', 'publish').not('last_enriched_at', 'is', null),
    supabase.from('crew_members').select('*', { count: 'exact', head: true })
      .eq('visibility', 'publish').not('last_enriched_at', 'is', null),
  ])
  return {
    companies_total: companiesTotal.count ?? 0,
    companies_enriched: companiesEnriched.count ?? 0,
    crew_total: crewTotal.count ?? 0,
    crew_enriched: crewEnriched.count ?? 0,
  }
}
