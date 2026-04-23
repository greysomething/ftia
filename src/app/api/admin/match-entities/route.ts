import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { cleanPgArray } from '@/lib/php-unserialize'

export const dynamic = 'force-dynamic'

interface MatchCandidate {
  id: number
  title: string        // company title or crew name
  slug: string
  score: number        // 0–100 confidence
  detail?: string      // extra info (address, phone, etc.)
}

/**
 * Given arrays of company names and crew names from a scan,
 * search the database for fuzzy matches and return candidates.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { companies = [], crew = [] } = await req.json() as {
    companies?: string[]
    crew?: string[]
  }

  const supabase = createAdminClient()

  // ── Strategy ──
  // Original implementation fetched the entire publish pool (capped at
  // 5k companies / 10k crew) and fuzzy-ranked in JS. Once the database grew
  // past those caps, anything alphabetically beyond the cutoff became
  // invisible to the matcher — so freshly-scanned production drafts would
  // miss perfectly-matchable rows like "Ketchup Entertainment" or
  // "James Gunn" until the user manually retriggered the typeahead.
  //
  // New approach: for each input name, do a targeted DB query that prefilters
  // by significant tokens (ilike against title/name). The pool we rank in JS
  // is bounded by relevance instead of alphabetical position, so coverage no
  // longer depends on how big the table is. Per-name queries run in parallel.
  //
  // Note: ilike '%token%' can't use a btree index; if this ever gets slow,
  // add a pg_trgm GIN index on companies.title and crew_members.name.

  const [companyEntries, crewEntries] = await Promise.all([
    Promise.all(
      companies
        .filter(n => n?.trim())
        .map(async (name) => [name, await matchCompany(supabase, name)] as const)
    ),
    Promise.all(
      crew
        .filter(n => n?.trim())
        .map(async (name) => [name, await matchCrew(supabase, name)] as const)
    ),
  ])

  const companyMatches: Record<string, MatchCandidate[]> = Object.fromEntries(companyEntries)
  const crewMatches: Record<string, MatchCandidate[]> = Object.fromEntries(crewEntries)

  return NextResponse.json({ companyMatches, crewMatches })
}

// Industry-generic words to skip when building per-token candidate pools.
// If we let "pictures" or "entertainment" be a search token, the bounded
// per-token query returns 40 alphabetically-first picture/entertainment
// companies and crowds out the actual match (e.g. "Lin Pictures" #13174,
// "Ketchup Entertainment" #70966). Keep this list tight — only words that
// genuinely appear in hundreds of company names.
const COMMON_COMPANY_TOKENS = new Set([
  'pictures', 'picture',
  'entertainment',
  'productions', 'production',
  'studio', 'studios',
  'films', 'film',
  'media',
  'group',
  'company',
  'corp', 'corporation',
  'limited',
  'the', 'and', 'for', 'with',
])

// --- Per-name candidate fetchers ---

async function matchCompany(
  supabase: ReturnType<typeof createAdminClient>,
  name: string,
): Promise<MatchCandidate[]> {
  const normalizedName = normalize(name)
  const nameParts = normalizedName.split(' ').filter(w => w.length > 2)

  // Pick distinctive tokens — drop industry-generic ones like "pictures" and
  // "entertainment". If everything was generic (e.g. "The Picture Company"),
  // fall back to the original tokens so we still produce SOME pool.
  const distinctiveTokens = nameParts.filter(t => !COMMON_COMPANY_TOKENS.has(t))
  const searchTokens = distinctiveTokens.length > 0 ? distinctiveTokens : nameParts
  if (searchTokens.length === 0 && !normalizedName) return []

  // Build candidate-pool queries from a layered strategy:
  //   1. Full normalized name as a phrase   (exact-match fast path)
  //   2. First 2 distinctive tokens combined (catches company-name "anchors"
  //      like "Warner Bros" inside longer scanned names like
  //      "Warner Bros. Pictures Animation" — without this, single-token
  //      queries on "warner"/"bros"/"animation" each cap at 40 rows of
  //      unrelated matches and the real Warner Bros entries get evicted.)
  //   3. Each distinctive token on its own (rare-token rescue path so e.g.
  //      "lin" finds "Lin Pictures" even when "pictures" floods)
  // Each query is independently bounded so no one query can starve another.
  const queries: any[] = []

  if (normalizedName) {
    queries.push(
      supabase
        .from('companies')
        .select('id, title, slug, addresses, phones, emails')
        .eq('visibility', 'publish')
        .ilike('title', `%${normalizedName}%`)
        .limit(20)
    )
  }

  // First-2-tokens phrase
  if (searchTokens.length >= 2) {
    const anchorPhrase = searchTokens.slice(0, 2).join(' ')
    queries.push(
      supabase
        .from('companies')
        .select('id, title, slug, addresses, phones, emails')
        .eq('visibility', 'publish')
        .ilike('title', `%${anchorPhrase}%`)
        .limit(40)
    )
  }

  for (const token of searchTokens) {
    queries.push(
      supabase
        .from('companies')
        .select('id, title, slug, addresses, phones, emails')
        .eq('visibility', 'publish')
        .ilike('title', `%${token}%`)
        .limit(40)
    )
  }

  const results = await Promise.all(queries)
  const pool = new Map<number, any>()
  for (const r of results) {
    for (const row of r.data ?? []) {
      if (!pool.has(row.id)) pool.set(row.id, row)
    }
  }

  const candidates: MatchCandidate[] = []
  for (const co of pool.values()) {
    const normalizedDbName = normalize(co.title)
    const score = scoreCandidate(normalizedName, normalizedDbName, nameParts)
    if (score >= 50) {
      candidates.push({
        id: co.id,
        title: co.title,
        slug: co.slug,
        score,
        detail: buildCleanDetail(co.addresses as string[], co.phones as string[], co.emails as string[]) || undefined,
      })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates.slice(0, 5)
}

/**
 * Score a candidate row's name against the search input using strict priority:
 *   100  — exact normalized match
 *   80–95 — one string contains the other (phrase match), scaled by length ratio
 *   ≤80   — word overlap / Levenshtein fuzzy similarity
 *
 * This ordering ensures a perfect match always sorts above any fuzzy result.
 */
function scoreCandidate(
  normalizedSearch: string,
  normalizedDb: string,
  searchParts: string[],
): number {
  if (!normalizedSearch || !normalizedDb) return 0

  // Priority 1: exact match
  if (normalizedDb === normalizedSearch) return 100

  // Priority 2: one contains the other as a phrase
  if (normalizedDb.includes(normalizedSearch) || normalizedSearch.includes(normalizedDb)) {
    const shorter = Math.min(normalizedDb.length, normalizedSearch.length)
    const longer = Math.max(normalizedDb.length, normalizedSearch.length)
    return Math.round(80 + 15 * (shorter / longer))
  }

  // Priority 3: fuzzy word/character similarity
  let score = fuzzyScore(normalizedSearch, normalizedDb)

  // Boost when the first significant word matches but the rest doesn't
  // (e.g. "Warner Bros Entertainment" → "Warner Bros")
  if (score < 50 && searchParts.length >= 1) {
    const dbParts = normalizedDb.split(' ').filter(w => w.length > 2)
    if (searchParts[0] && dbParts[0] && searchParts[0] === dbParts[0]) {
      const overlap = searchParts.filter(w => dbParts.includes(w)).length
      const maxWords = Math.max(searchParts.length, dbParts.length)
      score = Math.max(score, Math.round((overlap / maxWords) * 85))
    }
  }
  return score
}

async function matchCrew(
  supabase: ReturnType<typeof createAdminClient>,
  name: string,
): Promise<MatchCandidate[]> {
  const normalizedName = normalize(name)
  const nameParts = normalizedName.split(' ').filter(w => w.length > 1)

  // Use first + last token as distinctive search tokens (the most
  // identifying pieces of a person's name). One bounded query per token
  // so a common first name like "James" can't drown out the rare last
  // name's pool — and vice versa.
  const tokens = new Set<string>()
  if (nameParts.length > 0) {
    tokens.add(nameParts[0])
    tokens.add(nameParts[nameParts.length - 1])
  }

  const queries = Array.from(tokens).map(token =>
    supabase
      .from('crew_members')
      .select('id, name, slug, emails, phones')
      .eq('visibility', 'publish')
      .ilike('name', `%${token}%`)
      .limit(40)
  )
  // Direct full-name pass for the common case where the AI-extracted name
  // exactly matches a row.
  if (normalizedName) {
    queries.push(
      supabase
        .from('crew_members')
        .select('id, name, slug, emails, phones')
        .eq('visibility', 'publish')
        .ilike('name', `%${normalizedName}%`)
        .limit(20)
    )
  }
  if (queries.length === 0) return []

  const results = await Promise.all(queries)
  const pool = new Map<number, any>()
  for (const r of results) {
    for (const row of r.data ?? []) {
      if (!pool.has(row.id)) pool.set(row.id, row)
    }
  }

  const candidates: MatchCandidate[] = []
  for (const cm of pool.values()) {
    const normalizedDbName = normalize(cm.name)

    // Priority-ordered scoring (exact > phrase > fuzzy). For crew we also
    // layer in a last-name-similarity boost as a fourth fallback.
    let score = scoreCandidate(normalizedName, normalizedDbName, nameParts)

    if (score < 55 && nameParts.length >= 2) {
      const lastName = nameParts[nameParts.length - 1]
      const dbParts = normalizedDbName.split(' ').filter(w => w.length > 1)
      const dbLastName = dbParts[dbParts.length - 1] ?? ''

      if (lastName && dbLastName) {
        const lastNameScore = fuzzyScore(lastName, dbLastName)
        if (lastNameScore >= 70) {
          const firstName = nameParts[0]
          const dbFirstName = dbParts[0] ?? ''
          if (firstName && dbFirstName && (
            firstName === dbFirstName ||
            firstName.startsWith(dbFirstName) ||
            dbFirstName.startsWith(firstName)
          )) {
            score = Math.max(score, Math.round(lastNameScore * 0.85))
          } else {
            score = Math.max(score, Math.round(lastNameScore * 0.65))
          }
        }
      }
    }

    if (score >= 50) {
      candidates.push({
        id: cm.id,
        title: cm.name,
        slug: cm.slug,
        score,
        detail: buildCleanDetail([], cm.phones as string[], cm.emails as string[]) || undefined,
      })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates.slice(0, 5)
}

// --- Clean detail string (extract real values from PHP serialized WP data) ---
function buildCleanDetail(
  addresses: string[] = [],
  phones: string[] = [],
  emails: string[] = [],
): string {
  const parts: string[] = []

  const cleanAddrs = cleanPgArray(addresses)
  if (cleanAddrs[0]) parts.push(cleanAddrs[0].length > 50 ? cleanAddrs[0].slice(0, 47) + '...' : cleanAddrs[0])

  const cleanPhones = cleanPgArray(phones)
  if (cleanPhones[0]) parts.push(cleanPhones[0])

  const cleanEmails = cleanPgArray(emails)
  if (cleanEmails[0]) parts.push(cleanEmails[0])

  return parts.join(' | ')
}

// --- Fuzzy matching utilities ---

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')  // remove punctuation
    .replace(/\s+/g, ' ')          // collapse whitespace
    .trim()
}

/**
 * Fuzzy match score 0–100.
 * Uses a combination of:
 *  - Exact match (100)
 *  - Contains / contained-in (85)
 *  - Word overlap (Jaccard on words)
 *  - Levenshtein distance (for close misspellings)
 */
function fuzzyScore(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 100

  // One contains the other
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length)
    const longer = Math.max(a.length, b.length)
    return Math.round(70 + 25 * (shorter / longer))
  }

  // Word-level Jaccard similarity
  const wordsA = new Set(a.split(' ').filter(w => w.length > 1))
  const wordsB = new Set(b.split(' ').filter(w => w.length > 1))
  if (wordsA.size === 0 || wordsB.size === 0) return 0

  let intersection = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++
  }
  const union = new Set([...wordsA, ...wordsB]).size
  const jaccard = intersection / union

  // Levenshtein for short strings
  let levScore = 0
  if (a.length < 40 && b.length < 40) {
    const dist = levenshtein(a, b)
    const maxLen = Math.max(a.length, b.length)
    levScore = Math.max(0, 1 - dist / maxLen)
  }

  // Weighted combination
  return Math.round(Math.max(jaccard * 90, levScore * 85))
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}
