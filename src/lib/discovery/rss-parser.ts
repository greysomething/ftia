/**
 * Minimal RSS 2.0 + Atom parser. Extracts the fields we need:
 *   id (guid/link), title, link, summary (description/content), published_at.
 *
 * No new dependencies — handles both formats with a small regex-based scan.
 * Good enough for trade publication feeds (Variety, Deadline, THR, etc.).
 */

export interface ParsedFeedItem {
  external_id: string
  title: string
  link: string | null
  summary: string | null
  published_at: string | null  // ISO
  raw_data: Record<string, any>
}

const TAG_RE = (tag: string) =>
  new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i')

const ALL_ITEMS_RE = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi
const ALL_ENTRIES_RE = /<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi
const LINK_HREF_RE = /<link[^>]*\bhref=(?:"|')([^"']+)(?:"|')/i

function decode(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#?[a-z0-9]+;/gi, m => {
      // amp last so other entities resolve first
      if (m === '&amp;') return '&'
      return m
    })
    .replace(/&amp;/g, '&')
    .trim()
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function pickTag(block: string, tag: string): string | null {
  const m = block.match(TAG_RE(tag))
  return m ? decode(m[1]) : null
}

function pickDate(block: string, ...tags: string[]): string | null {
  for (const tag of tags) {
    const v = pickTag(block, tag)
    if (v) {
      const d = new Date(v)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
  }
  return null
}

function pickLink(block: string): string | null {
  // RSS: <link>https://...</link>  Atom: <link href="https://..." rel="alternate" />
  const direct = pickTag(block, 'link')
  if (direct && /^https?:\/\//i.test(direct)) return direct
  const m = block.match(LINK_HREF_RE)
  return m ? m[1] : null
}

/**
 * Parse a feed (RSS or Atom). Returns up to `limit` items.
 */
export function parseFeed(xml: string, limit = 30): ParsedFeedItem[] {
  const items: ParsedFeedItem[] = []
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml)
  const re = isAtom ? ALL_ENTRIES_RE : ALL_ITEMS_RE
  re.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null && items.length < limit) {
    const block = match[1]
    const title = pickTag(block, 'title') || ''
    if (!title) continue

    const link = pickLink(block)
    // Atom uses <id>; RSS uses <guid> or falls back to link
    const external_id = pickTag(block, 'id') || pickTag(block, 'guid') || link || title

    const summary = stripHtml(
      pickTag(block, 'description') ||
      pickTag(block, 'content:encoded') ||
      pickTag(block, 'summary') ||
      pickTag(block, 'content') ||
      ''
    ).slice(0, 2000) || null

    const published_at = pickDate(block, 'pubDate', 'published', 'dc:date', 'updated')

    items.push({
      external_id: external_id.slice(0, 500),
      title: stripHtml(title).slice(0, 500),
      link: link ? link.slice(0, 1000) : null,
      summary,
      published_at,
      raw_data: { source_format: isAtom ? 'atom' : 'rss' },
    })
  }
  return items
}

/**
 * Fetch a feed URL and return parsed items. Errors are thrown so the caller
 * can record them on the source row.
 */
export async function fetchFeed(url: string, limit = 30): Promise<ParsedFeedItem[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'ProductionListBot/1.0 (+https://productionlist.com)',
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml; q=0.9, */*; q=0.8',
    },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Feed returned HTTP ${res.status}`)
  const ct = res.headers.get('content-type') || ''
  const text = await res.text()
  if (!text || (!text.includes('<rss') && !text.includes('<feed') && !text.includes('<channel'))) {
    throw new Error(`Response does not look like a feed (content-type: ${ct})`)
  }
  return parseFeed(text, limit)
}
