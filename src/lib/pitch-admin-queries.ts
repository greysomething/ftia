/**
 * Admin-only pitch queries — uses createAdminClient to bypass RLS.
 */
import { createAdminClient } from '@/lib/supabase/server'

const PER_PAGE = 50

export type PitchSortField = 'title' | 'format' | 'view_count' | 'created_at' | 'published_at'

export async function getAdminPitches({
  page = 1,
  q,
  tab = 'all',
  sort = 'created_at' as PitchSortField,
  dir = 'desc' as 'asc' | 'desc',
}: {
  page?: number
  q?: string
  tab?: string
  sort?: PitchSortField
  dir?: 'asc' | 'desc'
} = {}) {
  const supabase = createAdminClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let query = supabase
    .from('pitches')
    .select(`
      *,
      pitch_genre_links(genre_id, is_primary, pitch_genres(id, name, slug)),
      user_profiles(id, display_name, first_name, last_name, avatar_url)
    `, { count: 'exact' })

  // Tab filters
  switch (tab) {
    case 'published':
      query = query.eq('visibility', 'publish')
      break
    case 'drafts':
      query = query.eq('visibility', 'draft')
      break
    case 'featured':
      query = query.eq('featured', true).neq('visibility', 'private')
      break
    case 'trash':
      query = query.eq('visibility', 'private')
      break
    case 'all':
    default:
      query = query.neq('visibility', 'private')
      break
  }

  if (q) {
    query = query.or(`title.ilike.%${q}%,logline.ilike.%${q}%`)
  }

  query = query
    .order(sort, { ascending: dir === 'asc' })
    .range(from, to)

  const { data, count } = await query

  return {
    pitches: data ?? [],
    total: count ?? 0,
    perPage: PER_PAGE,
  }
}

export async function getAdminPitchCounts() {
  const supabase = createAdminClient()

  const [all, published, drafts, featured, trash] = await Promise.all([
    supabase.from('pitches').select('id', { count: 'exact', head: true }).neq('visibility', 'private'),
    supabase.from('pitches').select('id', { count: 'exact', head: true }).eq('visibility', 'publish'),
    supabase.from('pitches').select('id', { count: 'exact', head: true }).eq('visibility', 'draft'),
    supabase.from('pitches').select('id', { count: 'exact', head: true }).eq('featured', true).neq('visibility', 'private'),
    supabase.from('pitches').select('id', { count: 'exact', head: true }).eq('visibility', 'private'),
  ])

  return {
    all: all.count ?? 0,
    published: published.count ?? 0,
    drafts: drafts.count ?? 0,
    featured: featured.count ?? 0,
    trash: trash.count ?? 0,
  }
}

export async function getAdminPitchById(id: number) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('pitches')
    .select(`
      *,
      pitch_genre_links(genre_id, is_primary, pitch_genres(id, name, slug)),
      pitch_attachments(id, file_name, storage_path, file_type, mime_type, file_size, created_at),
      user_profiles(id, display_name, first_name, last_name, organization_name, avatar_url)
    `)
    .eq('id', id)
    .single()
  return data
}
