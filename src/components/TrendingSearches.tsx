import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'

interface TrendingItem {
  title: string
  slug: string
  count: number
}

interface TrendingSearchesProps {
  variant?: 'sidebar' | 'footer'
  limit?: number
}

/**
 * Server component that displays trending/popular productions.
 * Uses search_clicks table if available, otherwise falls back to recently updated.
 */
export async function TrendingSearches({ variant = 'sidebar', limit = 10 }: TrendingSearchesProps) {
  const trending = await getTrending(limit)

  if (!trending.length) return null

  if (variant === 'footer') {
    return (
      <div>
        <h4 className="text-accent font-semibold mb-3">Trending Productions</h4>
        <ul className="space-y-1.5">
          {trending.map((item, i) => (
            <li key={item.slug}>
              <Link
                href={`/production/${item.slug}`}
                className="text-white/80 hover:text-white transition-colors text-sm"
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  // Sidebar variant
  return (
    <div className="white-bg p-4">
      <h3 className="flex items-center gap-2 font-semibold text-primary mb-3 text-sm">
        <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        Trending Productions
      </h3>
      <ol className="space-y-2">
        {trending.map((item, i) => (
          <li key={item.slug} className="flex items-start gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center mt-0.5">
              {i + 1}
            </span>
            <Link
              href={`/production/${item.slug}`}
              className="text-sm text-gray-700 hover:text-primary transition-colors leading-snug"
            >
              {item.title}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}

async function getTrending(limit: number): Promise<TrendingItem[]> {
  try {
    const supabase = createAdminClient()

    // Try search_clicks first
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: clicks, error } = await supabase
      .from('search_clicks')
      .select('production_id, production_title, production_slug')
      .gte('clicked_at', thirtyDaysAgo.toISOString())

    if (!error && clicks && clicks.length > 0) {
      const counts = new Map<number, TrendingItem>()
      for (const row of clicks) {
        const existing = counts.get(row.production_id)
        if (existing) {
          existing.count++
        } else {
          counts.set(row.production_id, {
            title: row.production_title,
            slug: row.production_slug,
            count: 1,
          })
        }
      }
      return Array.from(counts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)
    }

    // Fallback: most recently updated productions
    const { data: recent } = await supabase
      .from('productions')
      .select('id, title, slug')
      .eq('visibility', 'publish')
      .order('wp_updated_at', { ascending: false })
      .limit(limit)

    return (recent ?? []).map(p => ({
      title: p.title,
      slug: p.slug,
      count: 0,
    }))
  } catch {
    return []
  }
}

export default TrendingSearches
