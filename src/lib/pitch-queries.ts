/**
 * Pitch Marketplace data-fetching helpers — all run server-side via Supabase.
 * Called from Server Components and route handlers.
 */
import { createClient, createAdminClient } from '@/lib/supabase/server'

const PER_PAGE = 20

// ============================================================
// PUBLIC / MEMBER QUERIES
// ============================================================

export async function getPitches({
  page = 1,
  perPage = PER_PAGE,
  search,
  genre,
  format,
  budget,
  stage,
  sort = 'newest',
}: {
  page?: number
  perPage?: number
  search?: string
  genre?: string
  format?: string
  budget?: string
  stage?: string
  sort?: string
} = {}) {
  const supabase = await createClient()
  const from = (page - 1) * perPage
  const to = from + perPage - 1

  // Look up genre ID if filtering by genre slug
  let genreId: number | null = null
  if (genre) {
    const { data: genreData } = await supabase
      .from('pitch_genres')
      .select('id')
      .eq('slug', genre)
      .single()
    if (genreData) genreId = genreData.id
    else return { pitches: [], total: 0, page, perPage }
  }

  let query = supabase
    .from('pitches')
    .select(`
      *,
      pitch_genre_links(genre_id, is_primary, pitch_genres(id, name, slug)),
      user_profiles!inner(id, display_name, first_name, last_name, organization_name, avatar_url)
    `, { count: 'exact' })
    .eq('visibility', 'publish')

  // Filters
  if (search) {
    query = query.or(`title.ilike.%${search}%,logline.ilike.%${search}%`)
  }
  if (format) {
    query = query.eq('format', format)
  }
  if (budget) {
    query = query.eq('budget_range', budget)
  }
  if (stage) {
    query = query.eq('development_stage', stage)
  }

  // Genre filter — need to filter via junction table
  if (genreId) {
    // Get pitch IDs that have this genre
    const { data: genrePitchIds } = await supabase
      .from('pitch_genre_links')
      .select('pitch_id')
      .eq('genre_id', genreId)
    const ids = (genrePitchIds ?? []).map((g: any) => g.pitch_id)
    if (ids.length === 0) return { pitches: [], total: 0, page, perPage }
    query = query.in('id', ids)
  }

  // Sort
  switch (sort) {
    case 'most-viewed':
      query = query.order('view_count', { ascending: false })
      break
    case 'title-asc':
      query = query.order('title', { ascending: true })
      break
    case 'title-desc':
      query = query.order('title', { ascending: false })
      break
    case 'newest':
    default:
      query = query.order('published_at', { ascending: false, nullsFirst: false })
      break
  }

  query = query.range(from, to)

  const { data, count, error } = await query
  if (error) console.error('[getPitches]', error.message)

  return {
    pitches: data ?? [],
    total: count ?? 0,
    page,
    perPage,
  }
}

export async function getPitchBySlug(slug: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('pitches')
    .select(`
      *,
      pitch_genre_links(genre_id, is_primary, pitch_genres(id, name, slug)),
      pitch_attachments(id, file_name, storage_path, file_type, mime_type, file_size, created_at),
      user_profiles(id, display_name, first_name, last_name, organization_name, avatar_url, description)
    `)
    .eq('slug', slug)
    .single()

  if (error) console.error('[getPitchBySlug]', error.message)
  return data
}

export async function getPitchSlugs() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pitches')
    .select('slug')
    .eq('visibility', 'publish')
  return (data ?? []).map((p: any) => p.slug)
}

export async function getPitchGenres() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pitch_genres')
    .select('*')
    .order('sort_order', { ascending: true })
  return data ?? []
}

export async function getMyPitches(userId: string, {
  page = 1,
  tab = 'all',
}: {
  page?: number
  tab?: string
} = {}) {
  const supabase = await createClient()
  const perPage = 20
  const from = (page - 1) * perPage
  const to = from + perPage - 1

  let query = supabase
    .from('pitches')
    .select(`
      *,
      pitch_genre_links(genre_id, is_primary, pitch_genres(id, name, slug))
    `, { count: 'exact' })
    .eq('user_id', userId)

  // Tab filters
  switch (tab) {
    case 'published':
      query = query.eq('visibility', 'publish')
      break
    case 'drafts':
      query = query.eq('visibility', 'draft')
      break
    case 'all':
    default:
      query = query.neq('visibility', 'private') // hide trashed
      break
  }

  query = query.order('updated_at', { ascending: false }).range(from, to)

  const { data, count } = await query
  return { pitches: data ?? [], total: count ?? 0, page, perPage }
}

export async function getMyPitchCounts(userId: string) {
  const supabase = await createClient()

  const [all, published, drafts] = await Promise.all([
    supabase.from('pitches').select('id', { count: 'exact', head: true }).eq('user_id', userId).neq('visibility', 'private'),
    supabase.from('pitches').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('visibility', 'publish'),
    supabase.from('pitches').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('visibility', 'draft'),
  ])

  return {
    all: all.count ?? 0,
    published: published.count ?? 0,
    drafts: drafts.count ?? 0,
  }
}

export async function getFeaturedPitches(limit = 6) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pitches')
    .select(`
      *,
      pitch_genre_links(genre_id, is_primary, pitch_genres(id, name, slug)),
      user_profiles(id, display_name, first_name, last_name, organization_name, avatar_url)
    `)
    .eq('visibility', 'publish')
    .eq('featured', true)
    .order('published_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function getUserFavorites(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pitch_favorites')
    .select('pitch_id')
    .eq('user_id', userId)
  return new Set((data ?? []).map((f: any) => f.pitch_id))
}

export async function incrementPitchViewCount(pitchId: number) {
  const supabase = createAdminClient()
  await supabase.rpc('increment_pitch_view_count' as any, { p_id: pitchId }).catch(() => {
    // Fallback: direct update
    supabase.from('pitches').update({ view_count: pitchId } as any).eq('id', pitchId)
  })
  // Simple fallback without RPC
  await supabase
    .from('pitches')
    .update({ updated_at: new Date().toISOString() }) // trigger doesn't help, use raw SQL via admin
    .eq('id', pitchId)
}

// Simple view count increment via admin client
export async function incrementViewCount(pitchId: number) {
  const supabase = createAdminClient()
  // Fetch current count, then increment
  const { data } = await supabase
    .from('pitches')
    .select('view_count')
    .eq('id', pitchId)
    .single()
  if (data) {
    await supabase
      .from('pitches')
      .update({ view_count: (data.view_count ?? 0) + 1 })
      .eq('id', pitchId)
  }
}

export async function getPitchById(id: number) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pitches')
    .select(`
      *,
      pitch_genre_links(genre_id, is_primary, pitch_genres(id, name, slug)),
      pitch_attachments(id, file_name, storage_path, file_type, mime_type, file_size, created_at)
    `)
    .eq('id', id)
    .single()
  return data
}
