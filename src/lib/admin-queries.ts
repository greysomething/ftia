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
    query = query.eq('visibility', visibility)
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
    supabase.from('productions').select('*', { count: 'exact', head: true }).eq('visibility', 'draft'),
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
    .select('*')
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

// ─── Subscriptions & Orders ──────────────────────────────────────────────────

export async function getAdminSubscriptions({ page = 1, q, status }: { page?: number; q?: string; status?: string } = {}) {
  const supabase = createAdminClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  let query = supabase
    .from('user_memberships')
    .select(`
      id, user_id, level_id, status, stripe_customer_id, stripe_subscription_id,
      card_type, card_last4, startdate, enddate, modified, created_at,
      membership_levels(name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status) query = query.eq('status', status)

  const { data, count, error } = await query

  // If search query, we need user names — fetch user_profiles for returned memberships
  let subscriptions = data ?? []
  if (subscriptions.length > 0) {
    const userIds = [...new Set(subscriptions.map((s: any) => s.user_id))]
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, first_name, last_name, display_name')
      .in('id', userIds)

    if (profiles) {
      const profileMap = new Map(profiles.map((p: any) => [p.id, p]))
      subscriptions = subscriptions.map((s: any) => ({
        ...s,
        user_profile: profileMap.get(s.user_id) ?? null,
      }))
    }

    // Filter by search after attaching profiles
    if (q) {
      const lower = q.toLowerCase()
      subscriptions = subscriptions.filter((s: any) => {
        const p = s.user_profile
        if (!p) return false
        const name = [p.first_name, p.last_name, p.display_name].filter(Boolean).join(' ').toLowerCase()
        return name.includes(lower)
      })
    }
  }

  return { subscriptions, total: count ?? 0, perPage: PER_PAGE }
}

export async function getAdminSubscriptionStats() {
  const supabase = createAdminClient()

  const [
    { count: active },
    { count: cancelled },
    { count: expired },
    { count: pending },
    { count: totalOrders },
  ] = await Promise.all([
    supabase.from('user_memberships').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('user_memberships').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),
    supabase.from('user_memberships').select('*', { count: 'exact', head: true }).eq('status', 'expired'),
    supabase.from('user_memberships').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('membership_orders').select('*', { count: 'exact', head: true }),
  ])

  // Get recent revenue (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentOrders } = await supabase
    .from('membership_orders')
    .select('total')
    .gte('timestamp', thirtyDaysAgo)
    .eq('status', 'success')

  const recentRevenue = (recentOrders ?? []).reduce((sum: number, o: any) => sum + (o.total ?? 0), 0)

  return {
    active: active ?? 0,
    cancelled: cancelled ?? 0,
    expired: expired ?? 0,
    pending: pending ?? 0,
    totalOrders: totalOrders ?? 0,
    recentRevenue,
  }
}

export async function getAdminOrders({ page = 1 }: { page?: number } = {}) {
  const supabase = createAdminClient()
  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  const { data, count, error } = await supabase
    .from('membership_orders')
    .select(`
      id, user_id, level_id, total, status, gateway, payment_transaction_id,
      subscription_transaction_id, timestamp, created_at,
      membership_levels(name)
    `, { count: 'exact' })
    .order('timestamp', { ascending: false })
    .range(from, to)

  let orders = data ?? []
  if (orders.length > 0) {
    const userIds = [...new Set(orders.map((o: any) => o.user_id))]
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, first_name, last_name, display_name')
      .in('id', userIds)

    if (profiles) {
      const profileMap = new Map(profiles.map((p: any) => [p.id, p]))
      orders = orders.map((o: any) => ({
        ...o,
        user_profile: profileMap.get(o.user_id) ?? null,
      }))
    }
  }

  if (error) throw error
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
      organization_name, country, created_at
    `, { count: 'exact' })
    .order(sort, { ascending: dir === 'asc' })
    .range(from, to)

  if (q) {
    query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,display_name.ilike.%${q}%,organization_name.ilike.%${q}%`)
  }
  if (role) {
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

  // Post-filter by membership status if requested (can't do this in SQL easily with separate tables)
  let filtered = users
  if (membership === 'active') {
    filtered = users.filter((u: any) => u.user_memberships?.some((m: any) => m.status === 'active'))
  } else if (membership === 'cancelled') {
    filtered = users.filter((u: any) => u.user_memberships?.some((m: any) => m.status === 'cancelled'))
  } else if (membership === 'expired') {
    filtered = users.filter((u: any) => u.user_memberships?.some((m: any) => m.status === 'expired'))
  } else if (membership === 'none') {
    filtered = users.filter((u: any) => !u.user_memberships || u.user_memberships.length === 0)
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
  const { data: mems } = await supabase
    .from('user_memberships')
    .select('status, level_id, membership_levels(name, billing_amount, cycle_period)')

  const memCounts = { active: 0, cancelled: 0, expired: 0, pending: 0 }
  let mrr = 0 // Monthly Recurring Revenue
  const planBreakdown: Record<string, { name: string; active: number; total: number; mrr: number }> = {}

  for (const m of mems ?? []) {
    if (m.status in memCounts) (memCounts as any)[m.status]++

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

  return {
    total: totalCount ?? 0,
    admins: adminCount ?? 0,
    members: memberCount ?? 0,
    activeMemberships: memCounts.active,
    cancelledMemberships: memCounts.cancelled,
    expiredMemberships: memCounts.expired,
    pendingMemberships: memCounts.pending,
    noMembership: (totalCount ?? 0) - (mems?.length ?? 0),
    totalMemberships: mems?.length ?? 0,
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
