/**
 * Data-fetching helpers — all run server-side via Supabase.
 * These functions are called from Server Components and route handlers.
 */
import { createClient } from '@/lib/supabase/server'
import type { Production, Company, CrewMember, BlogPost, Page, TaxonomyTerm } from '@/types/database'

const PER_PAGE = 20

// ============================================================
// PRODUCTIONS
// ============================================================

export async function getProductions({
  page = 1,
  typeSlug,
  statusSlug,
  search,
}: {
  page?: number
  typeSlug?: string
  statusSlug?: string
  search?: string
} = {}) {
  const supabase = await createClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let query = supabase
    .from('productions')
    .select(
      `
      id, title, slug, excerpt, computed_status,
      production_date_start, wp_updated_at,
      production_type_links(is_primary, production_types(id,name,slug)),
      production_status_links(is_primary, production_statuses(id,name,slug)),
      production_locations(location, sort_order),
      media(storage_path, original_url, alt_text)
    `,
      { count: 'exact' }
    )
    .eq('visibility', 'publish')
    .order('wp_updated_at', { ascending: false })
    .range(from, to)

  if (search) {
    query = query.textSearch('title', search, { type: 'websearch' })
  }

  const { data, count, error } = await query
  if (error) throw error

  return { productions: data ?? [], total: count ?? 0, page, perPage: PER_PAGE }
}

export async function getProductionBySlug(slug: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('productions')
    .select(
      `
      *,
      production_type_links(is_primary, production_types(*)),
      production_status_links(is_primary, production_statuses(*)),
      production_locations(*),
      production_company_links(*, companies(*)),
      production_crew_roles(*, crew_members(*)),
      media(*)
    `
    )
    .eq('slug', slug)
    .eq('visibility', 'publish')
    .single()

  if (error) return null
  return data
}

export async function getProductionsByType(typeSlug: string, page = 1) {
  const supabase = await createClient()
  const from = (page - 1) * PER_PAGE

  const { data: typeData } = await supabase
    .from('production_types')
    .select('id, name, slug')
    .eq('slug', typeSlug)
    .single()

  if (!typeData) return null

  const { data, count } = await supabase
    .from('production_type_links')
    .select(
      'productions(id,title,slug,computed_status,production_date_start,wp_updated_at)',
      { count: 'exact' }
    )
    .eq('type_id', typeData.id)
    .range(from, from + PER_PAGE - 1)

  return {
    term: typeData,
    productions: data?.map((r: any) => r.productions).filter(Boolean) ?? [],
    total: count ?? 0,
    page,
  }
}

export async function getProductionsByStatus(statusSlug: string, page = 1) {
  const supabase = await createClient()
  const from = (page - 1) * PER_PAGE

  const { data: statusData } = await supabase
    .from('production_statuses')
    .select('id, name, slug')
    .eq('slug', statusSlug)
    .single()

  if (!statusData) return null

  const { data, count } = await supabase
    .from('production_status_links')
    .select(
      'productions(id,title,slug,computed_status,production_date_start,wp_updated_at)',
      { count: 'exact' }
    )
    .eq('status_id', statusData.id)
    .range(from, from + PER_PAGE - 1)

  return {
    term: statusData,
    productions: data?.map((r: any) => r.productions).filter(Boolean) ?? [],
    total: count ?? 0,
    page,
  }
}

// ============================================================
// COMPANIES (production-contact)
// ============================================================

export async function getCompanyBySlug(slug: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('companies')
    .select(
      `
      *,
      company_category_links(is_primary, company_categories(*)),
      company_staff(*, crew_members(*)),
      media(*)
    `
    )
    .eq('slug', slug)
    .eq('visibility', 'publish')
    .single()

  if (error) return null
  return data
}

export async function getCompaniesByCategory(categorySlug: string, page = 1) {
  const supabase = await createClient()
  const from = (page - 1) * PER_PAGE

  const { data: catData } = await supabase
    .from('company_categories')
    .select('id, name, slug')
    .eq('slug', categorySlug)
    .single()

  if (!catData) return null

  const { data, count } = await supabase
    .from('company_category_links')
    .select('companies(id,title,slug)', { count: 'exact' })
    .eq('category_id', catData.id)
    .range(from, from + PER_PAGE - 1)

  return {
    term: catData,
    companies: data?.map((r: any) => r.companies).filter(Boolean) ?? [],
    total: count ?? 0,
    page,
  }
}

// ============================================================
// CREW MEMBERS (production-role)
// ============================================================

export async function getCrewMemberBySlug(slug: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('crew_members')
    .select(
      `
      *,
      crew_category_links(is_primary, role_categories(*)),
      company_staff(*, companies(*))
    `
    )
    .eq('slug', slug)
    .eq('visibility', 'publish')
    .single()

  if (error) return null
  return data
}

export async function getCrewByCategory(categorySlug: string, page = 1) {
  const supabase = await createClient()
  const from = (page - 1) * PER_PAGE

  const { data: catData } = await supabase
    .from('role_categories')
    .select('id, name, slug')
    .eq('slug', categorySlug)
    .single()

  if (!catData) return null

  const { data, count } = await supabase
    .from('crew_category_links')
    .select('crew_members(id,name,slug,linkedin)', { count: 'exact' })
    .eq('category_id', catData.id)
    .range(from, from + PER_PAGE - 1)

  return {
    term: catData,
    crew: data?.map((r: any) => r.crew_members).filter(Boolean) ?? [],
    total: count ?? 0,
    page,
  }
}

// ============================================================
// BLOG POSTS
// ============================================================

export async function getBlogPosts(page = 1) {
  const supabase = await createClient()
  const from = (page - 1) * PER_PAGE

  const { data, count, error } = await supabase
    .from('blog_posts')
    .select(
      `
      id, title, slug, excerpt, published_at, wp_updated_at,
      media(storage_path, original_url, alt_text),
      blog_post_categories(blog_categories(id,name,slug)),
      blog_post_tags(blog_tags(id,name,slug))
    `,
      { count: 'exact' }
    )
    .eq('visibility', 'publish')
    .order('published_at', { ascending: false })
    .range(from, from + PER_PAGE - 1)

  if (error) throw error
  return { posts: data ?? [], total: count ?? 0, page, perPage: PER_PAGE }
}

export async function getBlogPostBySlug(slug: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('blog_posts')
    .select(
      `
      *,
      media(*),
      blog_post_categories(blog_categories(*)),
      blog_post_tags(blog_tags(*))
    `
    )
    .eq('slug', slug)
    .eq('visibility', 'publish')
    .single()

  if (error) return null
  return data
}

export async function getBlogPostsByCategory(categorySlug: string, page = 1) {
  const supabase = await createClient()
  const from = (page - 1) * PER_PAGE

  const { data: catData } = await supabase
    .from('blog_categories')
    .select('id, name, slug, description')
    .eq('slug', categorySlug)
    .single()

  if (!catData) return null

  const { data, count } = await supabase
    .from('blog_post_categories')
    .select('blog_posts(id,title,slug,excerpt,published_at)', { count: 'exact' })
    .eq('category_id', catData.id)
    .range(from, from + PER_PAGE - 1)

  return {
    category: catData,
    posts: data?.map((r: any) => r.blog_posts).filter(Boolean) ?? [],
    total: count ?? 0,
    page,
  }
}

export async function getBlogPostsByTag(tagSlug: string, page = 1) {
  const supabase = await createClient()
  const from = (page - 1) * PER_PAGE

  const { data: tagData } = await supabase
    .from('blog_tags')
    .select('id, name, slug')
    .eq('slug', tagSlug)
    .single()

  if (!tagData) return null

  const { data, count } = await supabase
    .from('blog_post_tags')
    .select('blog_posts(id,title,slug,excerpt,published_at)', { count: 'exact' })
    .eq('tag_id', tagData.id)
    .range(from, from + PER_PAGE - 1)

  return {
    tag: tagData,
    posts: data?.map((r: any) => r.blog_posts).filter(Boolean) ?? [],
    total: count ?? 0,
    page,
  }
}

// ============================================================
// PAGES
// ============================================================

export async function getPageBySlug(slug: string, parentSlug?: string) {
  const supabase = await createClient()

  let query = supabase
    .from('pages')
    .select('*, media(*)')
    .eq('slug', slug)

  if (parentSlug) {
    const { data: parent } = await supabase
      .from('pages')
      .select('id')
      .eq('slug', parentSlug)
      .single()
    if (parent) {
      query = query.eq('parent_id', parent.id)
    }
  } else {
    query = query.is('parent_id', null)
  }

  const { data, error } = await query.single()
  if (error) return null
  return data
}

// ============================================================
// MEMBERSHIP
// ============================================================

export async function getMembershipLevels() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('membership_levels')
    .select('*')
    .eq('is_active', true)
    .eq('allow_signups', true)
    .order('id')
  return data ?? []
}

export async function getUserActiveMembership(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('user_memberships')
    .select('*, membership_levels(*)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data
}

// ============================================================
// SEARCH
// ============================================================

export async function globalSearch(query: string, page = 1) {
  const supabase = await createClient()
  const from = (page - 1) * PER_PAGE

  const [productions, posts] = await Promise.all([
    supabase
      .from('productions')
      .select('id, title, slug, computed_status')
      .eq('visibility', 'publish')
      .textSearch('title', query, { type: 'websearch' })
      .limit(10),
    supabase
      .from('blog_posts')
      .select('id, title, slug, excerpt, published_at')
      .eq('visibility', 'publish')
      .textSearch('title', query, { type: 'websearch' })
      .limit(10),
  ])

  return {
    productions: productions.data ?? [],
    posts: posts.data ?? [],
    query,
  }
}

// ============================================================
// RSS / SITEMAP helpers
// ============================================================

export async function getRecentProductionsForRSS(limit = 20) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('productions')
    .select('id, title, slug, excerpt, wp_updated_at, production_type_links(production_types(name))')
    .eq('visibility', 'publish')
    .order('wp_updated_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function getProductionSlugs() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('productions')
    .select('slug, wp_updated_at')
    .eq('visibility', 'publish')
  return data ?? []
}

export async function getBlogSlugs() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('blog_posts')
    .select('slug, published_at')
    .eq('visibility', 'publish')
  return data ?? []
}
