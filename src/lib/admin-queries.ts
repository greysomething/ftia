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

export type ProductionSortField = 'id' | 'title' | 'computed_status' | 'visibility' | 'production_date_start' | 'wp_updated_at' | 'created_at'
export type SortDir = 'asc' | 'desc'

export async function getAdminProductions({
  page = 1,
  q,
  sort = 'wp_updated_at',
  dir = 'desc',
  visibility,
}: {
  page?: number
  q?: string
  sort?: ProductionSortField
  dir?: SortDir
  visibility?: string
} = {}) {
  const supabase = createAdminClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let query = supabase
    .from('productions')
    .select(`
      id, title, slug, computed_status, visibility,
      production_date_start, wp_updated_at, created_at,
      production_type_links(is_primary, production_types(name))
    `, { count: 'exact' })
    .order(sort, { ascending: dir === 'asc' })
    .range(from, to)

  if (q) {
    query = query.ilike('title', `%${q}%`)
  }

  if (visibility) {
    // Draft tab should show both 'draft' and legacy 'private' records
    if (visibility === 'draft') {
      query = query.in('visibility', ['draft', 'private'])
    } else {
      query = query.eq('visibility', visibility)
    }
  }

  const { data, count, error } = await query
  if (error) throw error

  return { productions: data ?? [], total: count ?? 0, perPage: PER_PAGE }
}

/** Get production counts grouped by visibility status */
export async function getAdminProductionCounts() {
  const supabase = createAdminClient()

  const [
    { count: allCount },
    { count: publishCount },
    { count: draftCount },
    { count: pendingCount },
    { count: trashCount },
  ] = await Promise.all([
    supabase.from('productions').select('*', { count: 'exact', head: true }),
    supabase.from('productions').select('*', { count: 'exact', head: true }).eq('visibility', 'publish'),
    supabase.from('productions').select('*', { count: 'exact', head: true }).in('visibility', ['draft', 'private']),
    supabase.from('productions').select('*', { count: 'exact', head: true }).eq('visibility', 'pending'),
    supabase.from('productions').select('*', { count: 'exact', head: true }).eq('visibility', 'trash'),
  ])

  return {
    all: allCount ?? 0,
    publish: publishCount ?? 0,
    draft: draftCount ?? 0,
    pending: pendingCount ?? 0,
    trash: trashCount ?? 0,
  }
}

export async function getAdminProductionById(id: number) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('productions')
    .select(`
      *,
      production_type_links(is_primary, production_types(id, name, slug)),
      production_status_links(is_primary, production_statuses(id, name, slug)),
      production_locations(id, location, city, stage, country, sort_order),
      production_company_links(id, company_id, inline_name, inline_address, inline_phones, inline_faxes, inline_emails, inline_linkedin, sort_order, companies(id, title, slug)),
      production_crew_roles(id, crew_id, role_name, inline_name, inline_linkedin, inline_phones, inline_emails, sort_order, crew_members(id, name, slug))
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

/** Fetch all production types for form dropdowns */
export async function getProductionTypeOptions() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('production_types')
    .select('id, name, slug')
    .order('name')
  return data ?? []
}

/** Fetch all production statuses for form dropdowns */
export async function getProductionStatusOptions() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('production_statuses')
    .select('id, name, slug')
    .order('name')
  return data ?? []
}

// ─── Companies ────────────────────────────────────────────────────────────────

export type CompanySortField = 'id' | 'title' | 'visibility' | 'wp_updated_at'

export async function getAdminCompanies({
  page = 1, q, visibility, sort = 'title', dir = 'asc',
}: {
  page?: number; q?: string; visibility?: string; sort?: CompanySortField; dir?: SortDir
} = {}) {
  const supabase = createAdminClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let query = supabase
    .from('companies')
    .select('id, title, slug, visibility, addresses, phones, wp_updated_at', { count: 'exact' })
    .order(sort, { ascending: dir === 'asc' })
    .range(from, to)

  if (q) query = query.ilike('title', `%${q}%`)
  if (visibility) query = query.eq('visibility', visibility)

  const { data, count, error } = await query
  if (error) throw error
  return { companies: data ?? [], total: count ?? 0, perPage: PER_PAGE }
}

export async function getAdminCompanyCounts() {
  const supabase = createAdminClient()
  const [
    { count: allCount },
    { count: publishCount },
    { count: draftCount },
    { count: trashCount },
  ] = await Promise.all([
    supabase.from('companies').select('*', { count: 'exact', head: true }),
    supabase.from('companies').select('*', { count: 'exact', head: true }).eq('visibility', 'publish'),
    supabase.from('companies').select('*', { count: 'exact', head: true }).eq('visibility', 'draft'),
    supabase.from('companies').select('*', { count: 'exact', head: true }).eq('visibility', 'trash'),
  ])
  return { all: allCount ?? 0, publish: publishCount ?? 0, draft: draftCount ?? 0, trash: trashCount ?? 0 }
}

export async function getAdminCompanyById(id: number) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('companies')
    .select('*, company_staff(*, crew_members(id, name, slug))')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// ─── Crew ─────────────────────────────────────────────────────────────────────

export type CrewSortField = 'id' | 'name' | 'visibility' | 'wp_updated_at'

export async function getAdminCrew({
  page = 1, q, visibility, sort = 'name', dir = 'asc',
}: {
  page?: number; q?: string; visibility?: string; sort?: CrewSortField; dir?: SortDir
} = {}) {
  const supabase = createAdminClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let query = supabase
    .from('crew_members')
    .select('id, name, slug, visibility, wp_updated_at, production_crew_roles(role_name)', { count: 'exact' })
    .order(sort, { ascending: dir === 'asc' })
    .range(from, to)

  if (q) query = query.ilike('name', `%${q}%`)
  if (visibility) query = query.eq('visibility', visibility)

  const { data, count, error } = await query
  if (error) throw error
  return { crew: data ?? [], total: count ?? 0, perPage: PER_PAGE }
}

export async function getAdminCrewCounts() {
  const supabase = createAdminClient()
  const [
    { count: allCount },
    { count: publishCount },
    { count: draftCount },
    { count: trashCount },
  ] = await Promise.all([
    supabase.from('crew_members').select('*', { count: 'exact', head: true }),
    supabase.from('crew_members').select('*', { count: 'exact', head: true }).eq('visibility', 'publish'),
    supabase.from('crew_members').select('*', { count: 'exact', head: true }).eq('visibility', 'draft'),
    supabase.from('crew_members').select('*', { count: 'exact', head: true }).eq('visibility', 'trash'),
  ])
  return { all: allCount ?? 0, publish: publishCount ?? 0, draft: draftCount ?? 0, trash: trashCount ?? 0 }
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

export async function getAdminBlogPosts({ page = 1, q, tab }: { page?: number; q?: string; tab?: string } = {}) {
  const supabase = createAdminClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1
  const now = new Date().toISOString()

  let query = supabase
    .from('blog_posts')
    .select('id, title, slug, visibility, published_at, updated_at, created_at', { count: 'exact' })

  // Apply tab filter
  if (tab === 'published') {
    query = query.eq('visibility', 'publish').or(`published_at.is.null,published_at.lte.${now}`)
  } else if (tab === 'drafts') {
    query = query.eq('visibility', 'draft')
  } else if (tab === 'scheduled') {
    query = query.eq('visibility', 'publish').gt('published_at', now)
  } else if (tab === 'trash') {
    query = query.eq('visibility', 'private')
  } else {
    // 'all' tab — show everything except trash
    query = query.neq('visibility', 'private')
  }

  if (q) query = query.ilike('title', `%${q}%`)
  query = query.order('published_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).range(from, to)

  const { data, count, error } = await query
  if (error) throw error
  return { posts: data ?? [], total: count ?? 0, perPage: PER_PAGE }
}

export async function getAdminBlogCounts() {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const [allRes, pubRes, draftRes, schedRes, trashRes] = await Promise.all([
    supabase.from('blog_posts').select('id', { count: 'exact', head: true }).neq('visibility', 'private'),
    supabase.from('blog_posts').select('id', { count: 'exact', head: true })
      .eq('visibility', 'publish').or(`published_at.is.null,published_at.lte.${now}`),
    supabase.from('blog_posts').select('id', { count: 'exact', head: true })
      .eq('visibility', 'draft'),
    supabase.from('blog_posts').select('id', { count: 'exact', head: true })
      .eq('visibility', 'publish').gt('published_at', now),
    supabase.from('blog_posts').select('id', { count: 'exact', head: true })
      .eq('visibility', 'private'),
  ])

  return {
    all: allRes.count ?? 0,
    published: pubRes.count ?? 0,
    drafts: draftRes.count ?? 0,
    scheduled: schedRes.count ?? 0,
    trash: trashRes.count ?? 0,
  }
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

// ─── Subscriptions & Orders ──────────────────────────────────────────────────

/**
 * Search helper: when a search query is provided, first resolve matching
 * user IDs from user_profiles so we can filter at the DB level (not post-pagination).
 */
async function resolveSearchUserIds(supabase: any, q: string): Promise<string[] | null> {
  if (!q) return null
  const lower = q.toLowerCase()
  // Search across first_name, last_name, display_name, email
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id')
    .or(`first_name.ilike.%${lower}%,last_name.ilike.%${lower}%,display_name.ilike.%${lower}%,email.ilike.%${lower}%`)
    .limit(500)
  return profiles?.map((p: any) => p.id) ?? []
}

/**
 * Attach user_profiles to a list of records that have user_id.
 */
async function attachProfiles(supabase: any, records: any[]): Promise<any[]> {
  if (records.length === 0) return records
  const userIds = [...new Set(records.map((r: any) => r.user_id))]
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, first_name, last_name, display_name, email')
    .in('id', userIds)
  if (!profiles) return records
  const profileMap = new Map(profiles.map((p: any) => [p.id, p]))
  return records.map((r: any) => ({
    ...r,
    user_profile: profileMap.get(r.user_id) ?? null,
  }))
}

export async function getAdminSubscriptions({ page = 1, q, status }: { page?: number; q?: string; status?: string } = {}) {
  const supabase = createAdminClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  // Resolve search to user IDs first (DB-level filtering)
  const searchUserIds = await resolveSearchUserIds(supabase, q ?? '')

  let query = supabase
    .from('user_memberships')
    .select(`
      id, user_id, level_id, status, stripe_customer_id, stripe_subscription_id,
      card_type, card_last4, card_exp_month, card_exp_year,
      billing_email,
      startdate, enddate, modified, created_at,
      membership_levels(name, billing_amount, cycle_period)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })

  if (status) {
    if (status === 'manual') {
      query = query.eq('status', 'active').is('stripe_subscription_id', null)
    } else {
      query = query.eq('status', status)
    }
  }

  // Apply search filter at DB level
  if (searchUserIds !== null) {
    if (searchUserIds.length === 0) {
      return { subscriptions: [], total: 0, perPage: PER_PAGE }
    }
    query = query.in('user_id', searchUserIds)
  }

  query = query.range(from, to)
  const { data, count } = await query
  const subscriptions = await attachProfiles(supabase, data ?? [])

  return { subscriptions, total: count ?? 0, perPage: PER_PAGE }
}

export async function getAdminSubscriptionStats() {
  const supabase = createAdminClient()

  // Fetch all memberships with their plan info in a single query
  const { data: allMemberships } = await supabase
    .from('user_memberships')
    .select('status, stripe_subscription_id, level_id, membership_levels(billing_amount, cycle_period)')

  const memberships = allMemberships ?? []

  // Count statuses
  const counts: Record<string, number> = {}
  let manual = 0
  let mrr = 0

  for (const m of memberships) {
    const s = m.status || 'unknown'
    counts[s] = (counts[s] || 0) + 1

    if (s === 'active' && !m.stripe_subscription_id) {
      manual++
    }

    // Calculate MRR from active subscriptions
    if (s === 'active') {
      const level = m.membership_levels as any
      const amount = parseFloat(level?.billing_amount || '0')
      const period = (level?.cycle_period || '').toLowerCase()
      if (period === 'month') mrr += amount
      else if (period === 'year') mrr += amount / 12
    }
  }

  // Revenue queries in parallel
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const thisMonthStart = new Date()
  thisMonthStart.setDate(1)
  thisMonthStart.setHours(0, 0, 0, 0)

  const [
    { data: recentOrders },
    { count: totalOrders },
    { count: newThisMonth },
    { data: orderStatusCounts },
  ] = await Promise.all([
    supabase
      .from('membership_orders')
      .select('total')
      .gte('timestamp', thirtyDaysAgo)
      .eq('status', 'success'),
    supabase.from('membership_orders').select('*', { count: 'exact', head: true }),
    // Count new signups this month using startdate (not created_at which reflects sync date)
    supabase
      .from('user_memberships')
      .select('*', { count: 'exact', head: true })
      .gte('startdate', thisMonthStart.toISOString())
      .not('status', 'in', '(expired,pending)'),
    supabase
      .from('membership_orders')
      .select('status'),
  ])

  const recentRevenue = (recentOrders ?? []).reduce((sum: number, o: any) => sum + (o.total ?? 0), 0)

  // Count order statuses
  const orderCounts: Record<string, number> = {}
  for (const o of (orderStatusCounts ?? [])) {
    const s = o.status || 'unknown'
    orderCounts[s] = (orderCounts[s] || 0) + 1
  }

  return {
    total: memberships.length,
    active: counts['active'] ?? 0,
    trialing: counts['trialing'] ?? 0,
    pastDue: counts['past_due'] ?? 0,
    cancelled: counts['cancelled'] ?? 0,
    expired: counts['expired'] ?? 0,
    suspended: counts['suspended'] ?? 0,
    pending: counts['pending'] ?? 0,
    manual,
    mrr,
    totalOrders: totalOrders ?? 0,
    newThisMonth: newThisMonth ?? 0,
    recentRevenue,
    orderCounts,
  }
}

export async function getAdminOrders({ page = 1, q, status }: { page?: number; q?: string; status?: string } = {}) {
  const supabase = createAdminClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  // Resolve search to user IDs first
  const searchUserIds = await resolveSearchUserIds(supabase, q ?? '')

  let query = supabase
    .from('membership_orders')
    .select(`
      id, user_id, level_id, total, status, gateway, payment_transaction_id,
      subscription_transaction_id, billing_reason, notes, timestamp, created_at,
      membership_levels(name)
    `, { count: 'exact' })
    .order('timestamp', { ascending: false })

  if (status) query = query.eq('status', status)

  if (searchUserIds !== null) {
    if (searchUserIds.length === 0) {
      return { orders: [], total: 0, perPage: PER_PAGE }
    }
    query = query.in('user_id', searchUserIds)
  }

  query = query.range(from, to)
  const { data, count, error } = await query
  if (error) throw error

  const orders = await attachProfiles(supabase, data ?? [])

  return { orders, total: count ?? 0, perPage: PER_PAGE }
}

// ─── Membership Plans ────────────────────────────────────────────────────────

export async function getAdminMembershipPlans() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('membership_levels')
    .select('*')
    .order('id', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getAdminMembershipPlanById(id: number) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('membership_levels')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// ─── Users ────────────────────────────────────────────────────────────────────

export type UserSortField = 'display_name' | 'created_at' | 'role'

export async function getAdminUsers({
  page = 1, q, role, membership, sort = 'created_at', dir = 'desc',
}: {
  page?: number; q?: string; role?: string; membership?: string
  sort?: UserSortField; dir?: SortDir
} = {}) {
  const supabase = createAdminClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let query = supabase
    .from('user_profiles')
    .select(`
      id, first_name, last_name, display_name, role, wp_role,
      organization_name, country, created_at, email
    `, { count: 'exact' })
    .order(sort, { ascending: dir === 'asc' })
    .range(from, to)

  if (q) {
    query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,display_name.ilike.%${q}%,organization_name.ilike.%${q}%,email.ilike.%${q}%`)
  }
  // 'active-members' is a virtual filter — don't pass it as a role query
  if (role && role !== 'active-members') {
    query = query.eq('role', role)
  }

  const { data, count, error } = await query
  if (error) throw error

  const users = data ?? []

  // Fetch memberships for these users
  if (users.length > 0) {
    const userIds = users.map((u: any) => u.id)
    const { data: memberships } = await supabase
      .from('user_memberships')
      .select('user_id, status, enddate, stripe_subscription_id, level_id, membership_levels(name)')
      .in('user_id', userIds)

    if (memberships && memberships.length > 0) {
      const membershipMap = new Map<string, any[]>()
      for (const m of memberships) {
        const existing = membershipMap.get(m.user_id) ?? []
        existing.push(m)
        membershipMap.set(m.user_id, existing)
      }
      for (const u of users as any[]) {
        u.user_memberships = membershipMap.get(u.id) ?? []
      }
    }
  }

  // Fetch auth emails for users missing the email column (fallback for un-backfilled rows)
  const usersWithoutEmail = users.filter((u: any) => !u.email)
  if (usersWithoutEmail.length > 0) {
    try {
      const userIds = usersWithoutEmail.map((u: any) => u.id)
      const emailMap = new Map<string, string>()
      let authPage = 1
      while (true) {
        const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ page: authPage, perPage: 1000 })
        if (!authUsers || authUsers.length === 0) break
        for (const au of authUsers) {
          if (au.email && userIds.includes(au.id)) {
            emailMap.set(au.id, au.email)
          }
        }
        if (authUsers.length < 1000) break
        authPage++
      }
      for (const u of usersWithoutEmail as any[]) {
        u.email = emailMap.get(u.id) ?? null
      }
    } catch {
      // Don't break if email fetch fails
    }
  }

  // Post-filter by membership status or role filter
  let filtered = users

  // 'active-members' tab = users with at least one active membership
  if (role === 'active-members') {
    filtered = filtered.filter((u: any) => u.user_memberships?.some((m: any) => ['active', 'trialing', 'past_due'].includes(m.status)))
  }

  if (membership === 'active') {
    filtered = filtered.filter((u: any) => u.user_memberships?.some((m: any) => m.status === 'active'))
  } else if (membership === 'trialing') {
    filtered = filtered.filter((u: any) => u.user_memberships?.some((m: any) => m.status === 'trialing'))
  } else if (membership === 'past_due') {
    filtered = filtered.filter((u: any) => u.user_memberships?.some((m: any) => m.status === 'past_due'))
  } else if (membership === 'cancelled') {
    filtered = filtered.filter((u: any) => u.user_memberships?.some((m: any) => m.status === 'cancelled'))
  } else if (membership === 'expired') {
    filtered = filtered.filter((u: any) => u.user_memberships?.some((m: any) => m.status === 'expired'))
  } else if (membership === 'manual') {
    filtered = filtered.filter((u: any) =>
      u.user_memberships?.some((m: any) => m.status === 'active' && !m.stripe_subscription_id)
    )
  } else if (membership === 'none') {
    filtered = filtered.filter((u: any) => !u.user_memberships || u.user_memberships.length === 0)
  }

  return { users: filtered, total: count ?? 0, perPage: PER_PAGE }
}

export async function getAdminUserCounts() {
  const supabase = createAdminClient()
  const [
    { count: totalCount },
    { count: adminCount },
    { count: memberCount },
  ] = await Promise.all([
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('role', 'member'),
  ])

  // Membership counts with revenue calculation
  // Supabase caps at 1000 rows by default — fetch all with pagination
  let mems: any[] = []
  let offset = 0
  const batchSize = 1000
  while (true) {
    const { data } = await supabase
      .from('user_memberships')
      .select('user_id, status, level_id, membership_levels(name, billing_amount, cycle_period)')
      .range(offset, offset + batchSize - 1)
    if (!data || data.length === 0) break
    mems = mems.concat(data)
    if (data.length < batchSize) break
    offset += batchSize
  }

  const memCounts = { active: 0, trialing: 0, past_due: 0, cancelled: 0, expired: 0, pending: 0 }
  let mrr = 0 // Monthly Recurring Revenue
  const planBreakdown: Record<string, { name: string; active: number; total: number; mrr: number }> = {}
  const uniqueUserIds = new Set<string>()

  for (const m of mems) {
    if (m.status in memCounts) (memCounts as any)[m.status]++
    if ((m as any).user_id) uniqueUserIds.add((m as any).user_id)

    const level = (m as any).membership_levels
    const planName = level?.name ?? 'Unknown'
    if (!planBreakdown[planName]) {
      planBreakdown[planName] = { name: planName, active: 0, total: 0, mrr: 0 }
    }
    planBreakdown[planName].total++

    if (m.status === 'active') {
      planBreakdown[planName].active++
      const amount = parseFloat(level?.billing_amount ?? 0)
      const period = level?.cycle_period
      let monthly = 0
      if (period === 'Month') monthly = amount
      else if (period === 'Year') monthly = amount / 12
      else if (period === 'Week') monthly = amount * 4.33
      else if (period === 'Day') monthly = amount * 30
      mrr += monthly
      planBreakdown[planName].mrr += monthly
    }
  }

  const planStats = Object.values(planBreakdown).sort((a, b) => b.active - a.active)
  const usersWithMembership = uniqueUserIds.size

  return {
    total: totalCount ?? 0,
    admins: adminCount ?? 0,
    members: memberCount ?? 0,
    activeMemberships: memCounts.active,
    trialingMemberships: memCounts.trialing,
    pastDueMemberships: memCounts.past_due,
    cancelledMemberships: memCounts.cancelled,
    expiredMemberships: memCounts.expired,
    pendingMemberships: memCounts.pending,
    noMembership: (totalCount ?? 0) - usersWithMembership,
    totalMemberships: mems.length,
    mrr,
    arr: mrr * 12,
    planStats,
  }
}

export async function getAdminUserById(id: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error

  // Fetch memberships separately (FK may not exist)
  const { data: memberships } = await supabase
    .from('user_memberships')
    .select('*, membership_levels(name, description)')
    .eq('user_id', id)

  return { ...data, user_memberships: memberships ?? [] }
}
