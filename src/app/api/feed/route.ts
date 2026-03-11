import { NextResponse } from 'next/server'
import { getRecentProductionsForRSS } from '@/lib/queries'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://productionlist.com'

export const dynamic = 'force-dynamic'
export const revalidate = 3600 // 1 hour

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  const productions = await getRecentProductionsForRSS(50)

  const items = productions
    .map((p: any) => {
      const title = escapeXml(p.title ?? 'Untitled')
      const link = `${SITE_URL}/production/${p.slug}`
      const pubDate = new Date(p.created_at).toUTCString()
      const desc = escapeXml(p.excerpt ?? `${p.title} — Film & TV Production`)

      return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${desc}</description>
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Production List — Latest Productions</title>
    <link>${SITE_URL}</link>
    <description>The latest film and television productions added to Production List.</description>
    <language>en-US</language>
    <atom:link href="${SITE_URL}/api/feed" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
