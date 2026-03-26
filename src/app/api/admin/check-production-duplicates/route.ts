import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface DuplicateMatch {
  id: number
  title: string
  slug: string
  types: string[]
  statuses: string[]
  similarity_score: number
  is_same_season: boolean
  season_info: string | null
}

/**
 * Extract the base title and season/episode info from a production title.
 * e.g. "High Potential - Series (Season 03)" → { base: "high potential", season: "03", type: "series" }
 */
function parseTitle(title: string) {
  let normalized = title.trim()

  // Extract season info
  const seasonPatterns = [
    /\(Season\s*(\d+)\)/i,
    /Season\s*(\d+)/i,
    /\(S(\d+)\)/i,
    /S(\d+)E\d+/i,
    /Series\s*(\d+)/i,
  ]
  let season: string | null = null
  for (const pat of seasonPatterns) {
    const m = normalized.match(pat)
    if (m) {
      season = m[1].replace(/^0+/, '') || '0' // remove leading zeros
      normalized = normalized.replace(m[0], '').trim()
      break
    }
  }

  // Extract episode info
  const episodePatterns = [
    /\(Episode\s*(\d+)\)/i,
    /Episode\s*(\d+)/i,
    /E(\d+)/i,
  ]
  let episode: string | null = null
  for (const pat of episodePatterns) {
    const m = normalized.match(pat)
    if (m) {
      episode = m[1]
      normalized = normalized.replace(m[0], '').trim()
      break
    }
  }

  // Strip type suffixes
  normalized = normalized
    .replace(/\s*-\s*(Series|Film|Feature Film|Pilot|TV|TV Movie|Documentary|Short Film|Musicals|Play|Theater|Video Game)\s*$/i, '')
    .replace(/\s*\((Series|Film|Feature Film|Pilot|TV|TV Movie|Documentary|Short Film)\)\s*/gi, '')
    .trim()

  // Clean up punctuation and normalize
  const base = normalized
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return { base, season, episode, original: title }
}

function fuzzyScore(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 100

  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length)
    const longer = Math.max(a.length, b.length)
    return Math.round(70 + 25 * (shorter / longer))
  }

  const wordsA = new Set(a.split(' ').filter(w => w.length > 1))
  const wordsB = new Set(b.split(' ').filter(w => w.length > 1))
  if (wordsA.size === 0 || wordsB.size === 0) return 0

  let intersection = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++
  }
  const union = new Set([...wordsA, ...wordsB]).size
  const jaccard = intersection / union

  let levScore = 0
  if (a.length < 50 && b.length < 50) {
    const dist = levenshtein(a, b)
    const maxLen = Math.max(a.length, b.length)
    levScore = Math.max(0, 1 - dist / maxLen)
  }

  return Math.round(Math.max(jaccard * 90, levScore * 85))
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
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

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { title } = await req.json()
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const parsed = parseTitle(title)
  const supabase = createAdminClient()

  // Fetch all productions (including drafts) with their types and statuses
  const { data: productions } = await supabase
    .from('productions')
    .select(`
      id, title, slug, visibility,
      production_type_links(production_types(name)),
      production_status_links(production_statuses(name))
    `)
    .in('visibility', ['publish', 'draft', 'members_only'])
    .limit(5000)

  const matches: DuplicateMatch[] = []

  for (const prod of productions ?? []) {
    const prodParsed = parseTitle(prod.title)
    const score = fuzzyScore(parsed.base, prodParsed.base)

    if (score < 60) continue

    // Check if same season
    const isSameSeason = parsed.season !== null && prodParsed.season !== null && parsed.season === prodParsed.season

    const types = (prod.production_type_links as any[] ?? [])
      .map((l: any) => l.production_types?.name)
      .filter(Boolean)
    const statuses = (prod.production_status_links as any[] ?? [])
      .map((l: any) => l.production_statuses?.name)
      .filter(Boolean)

    let seasonInfo: string | null = null
    if (prodParsed.season) seasonInfo = `Season ${prodParsed.season}`
    if (prodParsed.episode) seasonInfo = (seasonInfo ? seasonInfo + ', ' : '') + `Episode ${prodParsed.episode}`

    matches.push({
      id: prod.id,
      title: prod.title,
      slug: prod.slug,
      types,
      statuses,
      similarity_score: score,
      is_same_season: isSameSeason,
      season_info: seasonInfo,
    })
  }

  // Sort by score descending
  matches.sort((a, b) => b.similarity_score - a.similarity_score)

  return NextResponse.json({
    query: { base_title: parsed.base, season: parsed.season, episode: parsed.episode },
    matches: matches.slice(0, 10),
  })
}
