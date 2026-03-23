import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/search-click
 * Tracks when a user clicks on a production from search results.
 * Used to power the "Trending Searches" widget.
 */
export async function POST(request: NextRequest) {
  try {
    const { productionId, productionTitle, productionSlug, searchQuery } = await request.json()

    if (!productionId || !productionTitle || !productionSlug) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase.from('search_clicks').insert({
      production_id: productionId,
      production_title: productionTitle,
      production_slug: productionSlug,
      search_query: searchQuery || null,
    })

    if (error) {
      // Gracefully handle table not existing yet
      console.warn('search_clicks insert error:', error.message)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}

/**
 * GET /api/search-click
 * Returns trending productions (most clicked in the last 30 days).
 */
export async function GET() {
  try {
    const supabase = createAdminClient()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data, error } = await supabase
      .from('search_clicks')
      .select('production_id, production_title, production_slug')
      .gte('clicked_at', thirtyDaysAgo.toISOString())
      .order('clicked_at', { ascending: false })

    if (error || !data) {
      // Table might not exist yet — return fallback data from most-viewed productions
      return NextResponse.json({ trending: await getFallbackTrending() })
    }

    // Count clicks per production
    const clickCounts = new Map<number, { title: string; slug: string; count: number }>()
    for (const row of data) {
      const existing = clickCounts.get(row.production_id)
      if (existing) {
        existing.count++
      } else {
        clickCounts.set(row.production_id, {
          title: row.production_title,
          slug: row.production_slug,
          count: 1,
        })
      }
    }

    const trending = Array.from(clickCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return NextResponse.json({ trending })
  } catch {
    return NextResponse.json({ trending: await getFallbackTrending() })
  }
}

/** Fallback: return most recently updated productions as "trending" */
async function getFallbackTrending() {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('productions')
      .select('id, title, slug')
      .eq('visibility', 'publish')
      .order('wp_updated_at', { ascending: false })
      .limit(10)

    return (data ?? []).map(p => ({
      title: p.title,
      slug: p.slug,
      count: 0,
    }))
  } catch {
    return []
  }
}
