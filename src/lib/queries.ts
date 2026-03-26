/**
 * Data-fetching helpers — all run server-side via Supabase.
 * These functions are called from Server Components and route handlers.
 */
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { Production, Company, CrewMember, BlogPost, Page, TaxonomyTerm } from '@/types/database'

const PER_PAGE = 20

// ============================================================
// PRODUCTIONS
// ============================================================

export async function getProductions({
  page = 1,
  perPage = PER_PAGE,
  typeSlug,
  statusSlug,
  locationFilter,
  search,
  sort = 'updated',
}: {
  page?: number
  perPage?: number
  typeSlug?: string
  statusSlug?: string
  locationFilter?: string
  search?: string
  sort?: string
} = {}) {
  const supabase = await createClient()
  const from = (page - 1) * perPage
  const to = from + perPage - 1

  // Look up type/status IDs if filtering
  let typeId: number | null = null
  let statusId: number | null = null

  if (typeSlug) {
    const { data: typeData } = await supabase
      .from('production_types')
      .select('id')
      .eq('slug', typeSlug)
      .single()
    if (typeData) {
      typeId = typeData.id
    } else {
      return { productions: [], total: 0, page, perPage }
    }
  }

  if (statusSlug) {
    const { data: statusData } = await supabase
      .from('production_statuses')
      .select('id')
      .eq('slug', statusSlug)
      .single()
    if (statusData) {
      statusId = statusData.id
    } else {
      return { productions: [], total: 0, page, perPage }
    }
  }

  // For location filtering, we still need to collect IDs (no direct join filter possible)
  // but locations are typically fewer than types/statuses
  let locationIds: number[] | null = null
  if (locationFilter) {
    const allLocLinks: number[] = []
    let lPage = 0
    while (true) {
      let locQuery = supabase.from('production_locations').select('production_id')
      if (['United States', 'Canada', 'United Kingdom', 'France', 'Germany', 'Australia', 'Mexico'].includes(locationFilter)) {
        locQuery = locQuery.or(`country.eq.${locationFilter},location.ilike.%${locationFilter}%`)
      } else {
        locQuery = locQuery.or(`location.eq.${locationFilter},location.ilike.${locationFilter}%`)
      }
      const { data: locLinks } = await locQuery.range(lPage * 1000, lPage * 1000 + 999)
      if (!locLinks || locLinks.length === 0) break
      allLocLinks.push(...locLinks.map(l => l.production_id))
      if (locLinks.length < 1000) break
      lPage++
    }
    locationIds = allLocLinks
    if (locationIds.length === 0) {
      return { productions: [], total: 0, page, perPage }
    }
  }

  // Build select with !inner joins for type/status filtering
  // !inner makes it an INNER JOIN so only matching productions are returned
  const typeJoin = typeId
    ? 'production_type_links!inner(is_primary, type_id, production_types(id,name,slug))'
    : 'production_type_links(is_primary, production_types(id,name,slug))'
  const statusJoin = statusId
    ? 'production_status_links!inner(is_primary, status_id, production_statuses(id,name,slug))'
    : 'production_status_links(is_primary, production_statuses(id,name,slug))'

  let query = supabase
    .from('productions')
    .select(
      `
      id, title, slug, excerpt, computed_status,
      production_date_start, wp_updated_at,
      ${typeJoin},
      ${statusJoin},
      production_locations(location, city, stage, country, sort_order),
      media(storage_path, original_url, alt_text)
    `,
      { count: 'exact' }
    )
    .eq('visibility', 'publish')

  // Apply type filter via inner join
  if (typeId) {
    query = query.eq('production_type_links.type_id', typeId)
  }

  // Apply status filter via inner join
  if (statusId) {
    query = query.eq('production_status_links.status_id', statusId)
  }

  if (search) {
    query = query.ilike('title', `%${search}%`)
  }

  // Apply location filter (still uses .in() but location sets are typically small)
  if (locationIds !== null) {
    query = query.in('id', locationIds)
  }

  // Apply sorting
  switch (sort) {
    case 'title':
      query = query.order('title', { ascending: true })
      break
    case 'title-desc':
      query = query.order('title', { ascending: false })
      break
    case 'shoot-date':
      query = query.order('production_date_start', { ascending: true, nullsFirst: false })
      break
    case 'shoot-date-desc':
      query = query.order('production_date_start', { ascending: false, nullsFirst: false })
      break
    default: // 'updated'
      query = query.order('wp_updated_at', { ascending: false })
  }

  query = query.range(from, to)

  const { data, count, error } = await query
  if (error) throw error

  return { productions: data ?? [], total: count ?? 0, page, perPage }
}

/**
 * Get productions grouped by week for the Weekly List view.
 * Uses the production_week_entries table so productions persist in old weeks
 * even after being updated (and appearing in new weeks).
 *
 * Falls back to wp_updated_at grouping if the table doesn't exist yet.
 */
export async function getProductionWeeks() {
  const supabase = await createClient()

  // Paginate through all production_week_entries (Supabase default limit is 1000)
  const allEntries: Array<{ week_monday: string; production_id: number }> = []
  const PAGE_SIZE = 1000
  let page = 0
  let hasMore = true

  while (hasMore) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await (supabase as any)
      .from('production_week_entries')
      .select('week_monday, production_id')
      .range(from, to) as { data: any[] | null; error: any }

    if (error || !data || data.length === 0) {
      hasMore = false
    } else {
      allEntries.push(...data)
      hasMore = data.length === PAGE_SIZE
      page++
    }
  }

  if (allEntries.length > 0) {
    // Group by week_monday and count unique productions
    const weekMap = new Map<string, Set<number>>()
    for (const entry of allEntries) {
      const mondayStr = typeof entry.week_monday === 'string'
        ? entry.week_monday
        : new Date(entry.week_monday).toISOString().split('T')[0]
      const existing = weekMap.get(mondayStr)
      if (existing) {
        existing.add(entry.production_id)
      } else {
        weekMap.set(mondayStr, new Set([entry.production_id]))
      }
    }

    return Array.from(weekMap.entries())
      .map(([monday, ids]) => ({ monday, count: ids.size }))
      .sort((a, b) => b.monday.localeCompare(a.monday))
  }

  // Fallback: group by wp_updated_at (before migration is run)
  const { data: productions } = await supabase
    .from('productions')
    .select('id, wp_updated_at')
    .eq('visibility', 'publish')
    .not('wp_updated_at', 'is', null)
    .order('wp_updated_at', { ascending: false })

  if (!productions?.length) return []

  const weekMap = new Map<string, { monday: string; count: number }>()
  for (const p of productions) {
    const date = new Date(p.wp_updated_at)
    const day = date.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(date)
    monday.setDate(date.getDate() + diff)
    const mondayStr = monday.toISOString().split('T')[0]

    const existing = weekMap.get(mondayStr)
    if (existing) {
      existing.count++
    } else {
      weekMap.set(mondayStr, { monday: mondayStr, count: 1 })
    }
  }

  return Array.from(weekMap.values()).sort((a, b) => b.monday.localeCompare(a.monday))
}

/**
 * Get productions for a specific week (Mon–Sun).
 * Uses production_week_entries join table so a production can appear in multiple weeks.
 * Falls back to wp_updated_at filtering if the table doesn't exist yet.
 */
export async function getProductionsForWeek(mondayDate: string) {
  const supabase = await createClient()

  // Try the week entries table first
  const { data: weekEntries, error: weekError } = await (supabase as any)
    .from('production_week_entries')
    .select('production_id')
    .eq('week_monday', mondayDate) as { data: any[] | null; error: any }

  if (!weekError && weekEntries && weekEntries.length > 0) {
    const productionIds = weekEntries.map((e: any) => e.production_id)

    const { data, error } = await supabase
      .from('productions')
      .select(`
        id, title, slug, excerpt, computed_status,
        production_date_start, production_date_end, wp_updated_at, content,
        production_type_links(is_primary, production_types(id,name,slug)),
        production_status_links(is_primary, production_statuses(id,name,slug)),
        production_locations(location, city, stage, country, sort_order),
        production_company_links(*, companies(*)),
        production_crew_roles(*, crew_members(*)),
        media(storage_path, original_url, alt_text)
      `)
      .eq('visibility', 'publish')
      .in('id', productionIds)
      .order('title')

    if (error) throw error
    return data ?? []
  }

  // Fallback: use wp_updated_at range (before migration is run)
  const monday = new Date(mondayDate + 'T00:00:00Z')
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 7)

  const { data, error } = await supabase
    .from('productions')
    .select(`
      id, title, slug, excerpt, computed_status,
      production_date_start, production_date_end, wp_updated_at, content,
      production_type_links(is_primary, production_types(id,name,slug)),
      production_status_links(is_primary, production_statuses(id,name,slug)),
      production_locations(location, city, stage, country, sort_order),
      production_company_links(*, companies(*)),
      production_crew_roles(*, crew_members(*)),
      media(storage_path, original_url, alt_text)
    `)
    .eq('visibility', 'publish')
    .gte('wp_updated_at', monday.toISOString())
    .lt('wp_updated_at', sunday.toISOString())
    .order('title')

  if (error) throw error
  return data ?? []
}

/** Get top location options for the filter dropdown */
export async function getLocationFilterOptions() {
  const supabase = await createClient()

  // Paginate to avoid 1000 row limit
  const locations: any[] = []
  let locPage = 0
  while (true) {
    const { data } = await supabase
      .from('production_locations')
      .select('location, city, stage, country')
      .range(locPage * 1000, locPage * 1000 + 999)
    if (!data || data.length === 0) break
    locations.push(...data)
    if (data.length < 1000) break
    locPage++
  }

  if (!locations.length) return []

  // Count by normalized location key
  const counts = new Map<string, { label: string; value: string; count: number }>()

  for (const loc of locations) {
    let key: string
    let label: string

    if (loc.city && loc.stage) {
      key = `${loc.city}, ${loc.stage}`
      label = `${loc.city}, ${loc.stage}`
    } else if (loc.city) {
      key = loc.city
      label = loc.city
    } else if (loc.location) {
      // Normalize common variations
      key = loc.location
      label = loc.location
    } else {
      continue
    }

    const existing = counts.get(key)
    if (existing) {
      existing.count++
    } else {
      counts.set(key, { label, value: key, count: 1 })
    }
  }

  return Array.from(counts.values())
    .filter(l => l.count >= 2) // Only show locations with 2+ productions
    .sort((a, b) => b.count - a.count)
}

/**
 * Compute stats for a given week's productions: phase breakdown, type/location distribution,
 * company/crew counts, and week-over-week delta.
 */
export async function getWeeklyStats(currentMonday: string, previousMonday: string) {
  const [currentProductions, previousProductions] = await Promise.all([
    getProductionsForWeek(currentMonday),
    getProductionsForWeek(previousMonday),
  ])

  // Phase breakdown
  const phases: Record<string, number> = {}
  for (const p of currentProductions) {
    const phase = (p as any).computed_status || 'in-pre-production'
    phases[phase] = (phases[phase] || 0) + 1
  }

  // Type breakdown
  const types: Record<string, number> = {}
  for (const p of currentProductions) {
    const typeLinks = (p as any).production_type_links ?? []
    const primaryType = typeLinks.find((l: any) => l.is_primary)?.production_types?.name
      ?? typeLinks[0]?.production_types?.name ?? 'Unknown'
    types[primaryType] = (types[primaryType] || 0) + 1
  }
  const topTypes = Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Location breakdown
  const locations: Record<string, number> = {}
  for (const p of currentProductions) {
    for (const loc of (p as any).production_locations ?? []) {
      const city = loc.city || loc.location || 'Unknown'
      if (city && city !== 'Unknown') locations[city] = (locations[city] || 0) + 1
    }
  }
  const topLocations = Object.entries(locations).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Company & crew counts
  let totalCompanies = 0
  let totalCrew = 0
  for (const p of currentProductions) {
    totalCompanies += ((p as any).production_company_links ?? []).length
    totalCrew += ((p as any).production_crew_roles ?? []).length
  }

  return {
    currentCount: currentProductions.length,
    previousCount: previousProductions.length,
    delta: currentProductions.length - previousProductions.length,
    phases,
    topTypes,
    topLocations,
    totalCompanies,
    totalCrew,
    totalLocations: Object.keys(locations).length,
  }
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

export async function getBlogPosts(page = 1, { perPage, category }: { perPage?: number; category?: string } = {}) {
  const supabase = await createClient()
  const limit = perPage ?? PER_PAGE
  const from = (page - 1) * limit

  // If filtering by category, get IDs first
  let postIds: number[] | null = null
  if (category) {
    const { data: catData } = await supabase
      .from('blog_categories')
      .select('id')
      .eq('slug', category)
      .single()
    if (catData) {
      const { data: links } = await supabase
        .from('blog_post_categories')
        .select('post_id')
        .eq('category_id', catData.id)
      postIds = links?.map(l => l.post_id) ?? []
    } else {
      return { posts: [], total: 0, page, perPage: limit }
    }
  }

  const now = new Date().toISOString()
  let query = supabase
    .from('blog_posts')
    .select(
      `
      id, title, slug, excerpt, content, published_at, wp_updated_at, featured_image_url,
      media(storage_path, original_url, alt_text),
      blog_post_categories(blog_categories(id,name,slug)),
      blog_post_tags(blog_tags(id,name,slug))
    `,
      { count: 'exact' }
    )
    .eq('visibility', 'publish')
    .or(`published_at.is.null,published_at.lte.${now}`)
    .order('published_at', { ascending: false })

  if (postIds !== null) {
    if (postIds.length === 0) return { posts: [], total: 0, page, perPage: limit }
    query = query.in('id', postIds)
  }

  const { data, count, error } = await query.range(from, from + limit - 1)

  if (error) throw error
  return { posts: data ?? [], total: count ?? 0, page, perPage: limit }
}

export async function getBlogPostBySlug(slug: string): Promise<(BlogPost & Record<string, any>) | null> {
  const supabase = await createClient()
  const now = new Date().toISOString()

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
    .or(`published_at.is.null,published_at.lte.${now}`)
    .single()

  if (error) return null
  return data as any
}

export async function getBlogPostsByCategory(categorySlug: string, page = 1): Promise<any> {
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
    .select('blog_posts(id,title,slug,excerpt,content,published_at,media(storage_path,original_url,alt_text),blog_post_categories(blog_categories(id,name,slug)))', { count: 'exact' })
    .eq('category_id', catData.id)
    .order('published_at', { referencedTable: 'blog_posts', ascending: false })
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

export async function getBlogCategories() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('blog_categories')
    .select('id, name, slug')
    .order('name')

  return data ?? []
}

// ============================================================
// PAGES
// ============================================================

export async function getPageBySlug(slug: string, parentSlug?: string): Promise<(Page & Record<string, any>) | null> {
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
  return data as any
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

export async function getUserActiveMembership(userId: string): Promise<any> {
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
// WEEKLY LIST MANAGEMENT
// ============================================================

/**
 * Add a production to the current week's list.
 * Call this whenever a production is created or updated so it appears
 * in this week's list while staying in any previous weeks.
 */
export async function addProductionToCurrentWeek(productionId: number) {
  const supabase = createAdminClient()

  // Calculate this week's Monday
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  const mondayStr = monday.toISOString().split('T')[0]

  await (supabase as any)
    .from('production_week_entries')
    .upsert(
      { production_id: productionId, week_monday: mondayStr },
      { onConflict: 'production_id,week_monday' }
    )
}

/**
 * Snapshot all currently active (published) productions into the current week.
 * Useful for an admin "Generate Weekly List" action or a scheduled cron job.
 */
export async function snapshotCurrentWeek() {
  const supabase = createAdminClient()

  // Calculate this week's Monday
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  const mondayStr = monday.toISOString().split('T')[0]

  // Get all published productions
  const { data: productions } = await supabase
    .from('productions')
    .select('id')
    .eq('visibility', 'publish')

  if (!productions?.length) return 0

  // Insert into week entries (upsert to avoid duplicates)
  const entries = productions.map((p: any) => ({
    production_id: p.id,
    week_monday: mondayStr,
  }))

  // Batch in chunks of 500
  let inserted = 0
  for (let i = 0; i < entries.length; i += 500) {
    const chunk = entries.slice(i, i + 500)
    const { error } = await (supabase as any)
      .from('production_week_entries')
      .upsert(chunk, { onConflict: 'production_id,week_monday' })
    if (!error) inserted += chunk.length
  }

  return inserted
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

/** Used by generateStaticParams — no request context, so use admin client */
export async function getProductionSlugs(): Promise<Array<{ slug: string; wp_updated_at: string | null }>> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('productions')
    .select('slug, wp_updated_at')
    .eq('visibility', 'publish')
  return data ?? []
}

/** Used by generateStaticParams — no request context, so use admin client */
export async function getBlogSlugs(): Promise<Array<{ slug: string; published_at: string | null }>> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('blog_posts')
    .select('slug, published_at')
    .eq('visibility', 'publish')
  return data ?? []
}

// ============================================================
// DO NOT WORK NOTICES
// ============================================================

export async function getDnwNotices({ page = 1 }: { page?: number } = {}) {
  const supabase = await createClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  const { data, count, error } = await supabase
    .from('dnw_notices')
    .select('id, production_title, company_name, reason, details, notice_date, status', { count: 'exact' })
    .eq('status', 'active')
    .order('notice_date', { ascending: false })
    .range(from, to)

  if (error) throw error
  return { notices: data ?? [], total: count ?? 0, page, perPage: PER_PAGE }
}
