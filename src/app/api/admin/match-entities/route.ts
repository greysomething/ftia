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
  const companyMatches: Record<string, MatchCandidate[]> = {}
  const crewMatches: Record<string, MatchCandidate[]> = {}

  // --- Company matching ---
  if (companies.length > 0) {
    // Fetch all companies (we'll do client-side fuzzy matching since
    // Supabase doesn't have great fuzzy search without pg_trgm)
    const { data: allCompanies } = await supabase
      .from('companies')
      .select('id, title, slug, addresses, phones, emails')
      .eq('visibility', 'publish')
      .order('title')
      .limit(5000)

    for (const name of companies) {
      if (!name?.trim()) continue
      const normalizedName = normalize(name)
      const nameParts = normalizedName.split(' ').filter(w => w.length > 2)
      const candidates: MatchCandidate[] = []

      for (const co of allCompanies ?? []) {
        const normalizedDbName = normalize(co.title)
        let score = fuzzyScore(normalizedName, normalizedDbName)

        // If full match is below threshold, try matching on first significant word
        // (e.g. "Warner Bros Entertainment" should match "Warner Bros")
        if (score < 50 && nameParts.length >= 1) {
          const dbParts = normalizedDbName.split(' ').filter(w => w.length > 2)
          // Check if the first word matches
          if (nameParts[0] && dbParts[0] && nameParts[0] === dbParts[0]) {
            // First word exact match — use word overlap for score
            const overlap = nameParts.filter(w => dbParts.includes(w)).length
            const maxWords = Math.max(nameParts.length, dbParts.length)
            score = Math.max(score, Math.round((overlap / maxWords) * 85))
          }
        }

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

      // Sort by score descending, keep top 5
      candidates.sort((a, b) => b.score - a.score)
      companyMatches[name] = candidates.slice(0, 5)
    }
  }

  // --- Crew matching ---
  if (crew.length > 0) {
    const { data: allCrew } = await supabase
      .from('crew_members')
      .select('id, name, slug, emails, phones')
      .eq('visibility', 'publish')
      .order('name')
      .limit(10000)

    for (const name of crew) {
      if (!name?.trim()) continue
      const normalizedName = normalize(name)
      const nameParts = normalizedName.split(' ').filter(w => w.length > 1)
      const candidates: MatchCandidate[] = []

      for (const cm of allCrew ?? []) {
        const normalizedDbName = normalize(cm.name)
        let score = fuzzyScore(normalizedName, normalizedDbName)

        // If full-name match is below threshold, try last-name match
        // (handles cases like "Jean Nainchrik" matching "Jean Nainchrik" spelled differently)
        if (score < 55 && nameParts.length >= 2) {
          const lastName = nameParts[nameParts.length - 1]
          const dbParts = normalizedDbName.split(' ').filter(w => w.length > 1)
          const dbLastName = dbParts[dbParts.length - 1] ?? ''

          // Check if last names are similar
          if (lastName && dbLastName) {
            const lastNameScore = fuzzyScore(lastName, dbLastName)
            if (lastNameScore >= 70) {
              // Last name matches well — check first name/initial too
              const firstName = nameParts[0]
              const dbFirstName = dbParts[0] ?? ''
              if (firstName && dbFirstName && (
                firstName === dbFirstName ||
                firstName.startsWith(dbFirstName) ||
                dbFirstName.startsWith(firstName)
              )) {
                // First name matches or is a prefix — boost score
                score = Math.max(score, Math.round(lastNameScore * 0.85))
              } else {
                // Only last name matches — lower confidence
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
      crewMatches[name] = candidates.slice(0, 5)
    }
  }

  return NextResponse.json({ companyMatches, crewMatches })
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
