import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUser, isMember } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()
  const type = searchParams.get('type') ?? 'all' // all | productions | companies | crew
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const perPage = 20
  const offset = (page - 1) * perPage

  if (q.length < 2) {
    return NextResponse.json({ results: [], total: 0, query: q })
  }

  const supabase = await createClient()
  const user = await getUser()
  const member = user ? await isMember(user.id) : false

  const results: any[] = []
  let total = 0

  const searchQuery = q
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w + ':*')
    .join(' & ')

  if (type === 'all' || type === 'productions') {
    const { data, count } = await supabase
      .from('productions')
      .select(
        'id, title, slug, excerpt, created_at, production_type_links(production_types(name))',
        { count: 'exact' }
      )
      .eq('visibility', 'publish')
      .textSearch('fts', searchQuery, { type: 'websearch', config: 'english' })
      .range(offset, offset + perPage - 1)

    if (data) {
      results.push(
        ...data.map((r) => ({
          type: 'production',
          id: r.id,
          title: r.title,
          slug: r.slug,
          url: `/production/${r.slug}`,
          excerpt: r.excerpt,
          meta: (r.production_type_links as any)?.[0]?.production_types?.name ?? null,
        }))
      )
      total += count ?? 0
    }
  }

  if (type === 'all' || type === 'companies') {
    const { data, count } = await supabase
      .from('companies')
      .select(
        'id, title, slug, excerpt, company_category_links(company_categories(name))',
        { count: 'exact' }
      )
      .eq('visibility', 'publish')
      .textSearch('fts', searchQuery, { type: 'websearch', config: 'english' })
      .range(offset, offset + perPage - 1)

    if (data) {
      results.push(
        ...data.map((r) => ({
          type: 'company',
          id: r.id,
          title: r.title,
          slug: r.slug,
          url: `/production-contact/${r.slug}`,
          excerpt: r.excerpt,
          meta: (r.company_category_links as any)?.[0]?.company_categories?.name ?? null,
        }))
      )
      total += count ?? 0
    }
  }

  if (type === 'all' || type === 'crew') {
    const { data, count } = await supabase
      .from('crew_members')
      .select(
        'id, title, slug, excerpt, crew_category_links(role_categories(name))',
        { count: 'exact' }
      )
      .eq('visibility', 'publish')
      .textSearch('fts', searchQuery, { type: 'websearch', config: 'english' })
      .range(offset, offset + perPage - 1)

    if (data) {
      results.push(
        ...data.map((r) => ({
          type: 'crew',
          id: r.id,
          title: r.title,
          slug: r.slug,
          url: `/production-role/${r.slug}`,
          // Mask contact info for non-members
          excerpt: member ? r.excerpt : null,
          meta: (r.crew_category_links as any)?.[0]?.role_categories?.name ?? null,
        }))
      )
      total += count ?? 0
    }
  }

  // Log search query
  if (q.length >= 3) {
    await supabase.from('search_log').insert({
      query: q,
      results_count: total,
      user_id: user?.id ?? null,
    }).then(() => {}) // fire-and-forget
  }

  return NextResponse.json({
    results,
    total,
    query: q,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  })
}
