import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/server'
import { LoginLogClient } from './LoginLogClient'

export const metadata: Metadata = { title: 'Activity Log' }

export default async function AdminLoginLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string; search?: string; from?: string; to?: string }>
}) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const eventType = params.type ?? 'all'
  const search = params.search ?? ''
  const fromDate = params.from ?? ''
  const toDate = params.to ?? ''
  const perPage = 50

  const supabase = createAdminClient()

  // Build query
  let query = supabase
    .from('activity_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (eventType !== 'all') {
    query = query.eq('event_type', eventType)
  }
  if (search) {
    // Search by email, IP, or look up user_id from matching profiles
    // First, find any user_ids that match the search email
    const { data: matchingProfiles } = await supabase
      .from('user_profiles')
      .select('id')
      .ilike('email', `%${search}%`)
      .limit(50)

    const userIds = matchingProfiles?.map((p: any) => p.id) ?? []

    if (userIds.length > 0) {
      // Search by email OR ip OR user_id (for events logged without email)
      const userIdFilters = userIds.map((id: string) => `user_id.eq.${id}`).join(',')
      query = query.or(`email.ilike.%${search}%,ip_address::text.ilike.%${search}%,${userIdFilters}`)
    } else {
      query = query.or(`email.ilike.%${search}%,ip_address::text.ilike.%${search}%`)
    }
  }
  if (fromDate) {
    query = query.gte('created_at', fromDate + 'T00:00:00')
  }
  if (toDate) {
    query = query.lte('created_at', toDate + 'T23:59:59')
  }

  query = query.range((page - 1) * perPage, page * perPage - 1)

  const { data: logs, count, error } = await query

  if (error && error.message?.includes('does not exist')) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Activity Log</h1>
        <div className="admin-card p-8 text-center">
          <p className="text-gray-500 mb-4">The activity_log table hasn&apos;t been created yet.</p>
          <p className="text-sm text-gray-400">
            Run the SQL migration in <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">sql/create-activity-log.sql</code> in the Supabase SQL Editor.
          </p>
        </div>
      </div>
    )
  }

  // Summary stats
  const { data: statsData } = await supabase
    .from('activity_log')
    .select('event_type')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  const stats = {
    logins24h: statsData?.filter((r: any) => r.event_type === 'login').length ?? 0,
    failed24h: statsData?.filter((r: any) => r.event_type === 'login_failed').length ?? 0,
    registrations24h: statsData?.filter((r: any) => r.event_type === 'register').length ?? 0,
    total: count ?? 0,
  }

  return (
    <LoginLogClient
      logs={logs ?? []}
      stats={stats}
      totalCount={count ?? 0}
      currentPage={page}
      perPage={perPage}
      filters={{ eventType, search, fromDate, toDate }}
    />
  )
}
