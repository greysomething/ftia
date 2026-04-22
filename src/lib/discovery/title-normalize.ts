/**
 * Title normalization + similarity matching for production dedup.
 *
 * Two productions match if their normalized titles are equal, or if their
 * Dice coefficient (bigram similarity) is above the configured threshold.
 */

const ARTICLES = /^(the|a|an)\s+/i
const FORMAT_SUFFIXES = /\s*\((tv|tv series|series|miniseries|limited series|movie|film|feature|short|documentary|doc)\)\s*$/i
const YEAR_SUFFIX = /\s*\((19|20)\d{2}\)\s*$/

export function normalizeTitle(title: string): string {
  if (!title) return ''
  let t = title.trim()
  // Strip year/format suffixes once each (some titles have both)
  t = t.replace(YEAR_SUFFIX, '').replace(FORMAT_SUFFIXES, '')
  t = t.replace(YEAR_SUFFIX, '').replace(FORMAT_SUFFIXES, '')
  // Drop leading articles
  t = t.replace(ARTICLES, '')
  // Normalize punctuation/whitespace
  t = t.toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")        // smart quotes
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')      // strip all punctuation
    .replace(/\s+/g, ' ')
    .trim()
  return t
}

/**
 * Dice coefficient (bigram similarity). Range 0–1.
 * For very short strings (<2 chars) falls back to exact match.
 */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const bigrams = (s: string) => {
    const out = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2)
      out.set(bg, (out.get(bg) ?? 0) + 1)
    }
    return out
  }
  const A = bigrams(a)
  const B = bigrams(b)
  let intersection = 0
  for (const [bg, count] of A) {
    const other = B.get(bg)
    if (other) intersection += Math.min(count, other)
  }
  let totalA = 0, totalB = 0
  for (const c of A.values()) totalA += c
  for (const c of B.values()) totalB += c
  return (2 * intersection) / (totalA + totalB)
}

/**
 * Find the best matching existing production from a list of (id, title)
 * candidates. Returns the candidate + similarity score, or null if below
 * threshold.
 */
export function findBestMatch(
  inputTitle: string,
  candidates: Array<{ id: number; title: string }>,
  thresholdPct = 85,
): { id: number; title: string; score: number } | null {
  const target = normalizeTitle(inputTitle)
  if (!target) return null
  let best: { id: number; title: string; score: number } | null = null
  for (const c of candidates) {
    const norm = normalizeTitle(c.title)
    if (!norm) continue
    const score = diceSimilarity(target, norm)
    if (!best || score > best.score) {
      best = { id: c.id, title: c.title, score }
    }
  }
  if (!best || best.score * 100 < thresholdPct) return null
  return best
}
