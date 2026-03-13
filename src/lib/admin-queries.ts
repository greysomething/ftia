/**
 * Admin-only queries — use createAdminClient() so they bypass RLS.
 * Only call these from Server Components / Server Actions behind requireAdmin().
 */
import { createAdminClient } from '@/lib/supabase/server'

const PER_PAGE = 50

// ─── Dashboard stats ──────────────────────────────────────────────────────────

export async function getAdminStats() {
  const supabase = createAdminClient()

  const [
    { count: totalProductions },
    { count: totalCompanies },
    { count: totalCrew },
    { count: totalUsers },
    { count: activeMembers },
  ] = await Promise.all([
    supabase.from('productions').select('*', { count: 'exact', head: true }),
    supabase.from('companies').select('*', { count: 'exact', head: true }),
    supabase.from('crew_members').select('*', { count: 'exact', head: true }),
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
    supabase
      .from('user_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active'),
  ])

  return {
    totalProductions: totalProductions ?? 0,
    totalCompanies: totalCompanies ?? 0,
    totalCrew: totalCrew ?? 0,
    totalUsers: totalUsers ?? 0,
    activeMembers: activeMembers ?? 0,
  }
}

// ─── Productions ──────────────────────────────────────────────────────────────

export async function getAdminProductions({ page = 1, q }: { page?: number; q?: string } = {}) {
  const supabase = createAdminClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let query = supabase
    .from('productions')
    .select(`
      id, title, slug, computed_status, visibility,
      production_date_start, wp_updated_at,
      production_type_links(is_primary, production_types(name))
    `, { count: 'exact' })
    .order('id', { ascending: false })
    .range(from, to)

  if (q) {
    query = query.ilike('title', `%${q}%`)
  }

  const { data, count, error } = await query
  if (error) throw error

  return { productions: data ?? [], total: count ?? 0, perPage: PER_PAGE }
}

export async function getAdminProductionById(id: number) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('productions')
    .select(`
      *,
      production_type_links(is_primary, production_types(id, name, slug)),
      production_status_links(is_primary, production_statuses(id, name, slug)),
      production_locations(location, city, province, country),
      production_unions(union_name)
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// ─── Companies ────────────────────────────────────────────────────────────────

export async function getAdminCompanies({ page = 1, q }: { page?: number; q?: string } = {}) {
  const supabase = createAdminClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let query = supabase
    .from('companies')
    .select('id, title, slug, visibility, wp_updated_at', { count: 'exact' })
    .order('title', { ascending: true })
    .range(from, to)

  if (q) query = query.ilike('title', `%${q}%`)

  const { data, count, error } = await query
  if (error) throw error
  return { companies: data ?? [], total: count ?? 0, perPage: PER_PAGE }
}

export async function getAdminCompanyById(id: number) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// ─── Crew ─────────────────────────────────────────────────────────────────────

export async function getAdminCrew({ page = 1, q }: { page?: number; q?: string } = {}) {
  const supabase = createAdminClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let query = supabase
    .from('crew_members')
    .select('id, name, slug, visibility, wp_updated_at', { count: 'exact' })
    .order('name', { ascending: true })
    .range(from, to)

  if (q) query = query.ilike('name', `%${q}%`)

  const { data, count, error } = await query
  if (error) throw error
  return { crew: data ?? [], total: count ?? 0, perPage: PER_PAGE }
}

export async function getAdminCrewById(id: number) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('crew_members')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// ─── Blog ─────────────────────────────────────────────────────────────────────

export async function getAdminBlogPosts({ page = 1, q }: { page?: number; q?: string } = {}) {
  const supabase = createAdminClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let query = supabase
    .from('blog_posts')
    .select('id, title, slug, status, published_at, updated_at', { count: 'exact' })
    .order('id', { ascending: false })
    .range(from, to)

  if (q) query = query.ilike('title', `%${q}%`)

  const { data, count, error } = await query
  if (error) throw error
  return { posts: data ?? [], total: count ?? 0, perPage: PER_PAGE }
}

export async function getAdminBlogPostById(id: number) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// ─── DNW Notices ─────────────────────────────────────────────────────────────

export async function getAdminDnwNotices({ page = 1, q }: { page?: number; q?: string } = {}) {
  const supabase = createAdminClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let query = supabase
    .from('dnw_notices')
    .select('id, production_title, company_name, reason, notice_date, status, created_at', { count: 'exact' })
    .order('notice_date', { ascending: false })
    .range(from, to)

  if (q) {
    query = query.or(`production_title.ilike.%${q}%,company_name.ilike.%${q}%`)
  }

  const { data, count, error } = await query
  if (error) throw error
  return { notices: data ?? [], total: count ?? 0, perPage: PER_PAGE }
}

export async function getAdminDnwNoticeById(id: number) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('dnw_notices')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getAdminUsers({ page = 1, q }: { page?: number; q?: string } = {}) {
  const supabase = createAdminClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let query = supabase
    .from('user_profiles')
    .select(`
      id, first_name, last_name, display_name, role, wp_role, created_at,
      user_memberships(status, enddate, membership_levels(name))
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (q) {
    query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,display_name.ilike.%${q}%`)
  }

  const { data, count, error } = await query
  if (error) throw error
  return { users: data ?? [], total: count ?? 0, perPage: PER_PAGE }
}

export async function getAdminUserById(id: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('user_profiles')
    .select(`
      *,
      user_memberships(*, membership_levels(name, description))
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}
