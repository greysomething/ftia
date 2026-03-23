import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminSubscriptions, getAdminSubscriptionStats, getAdminOrders } from '@/lib/admin-queries'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { formatDate } from '@/lib/utils'
import { StatCard } from '@/components/admin/StatCard'

export const metadata: Metadata = { title: 'Subscriptions & Payments' }

interface Props {
  searchParams: Promise<{ page?: string; q?: string; status?: string; tab?: string }>
}

const STATUS_BADGES: Record<string, string> = {
  active: 'badge-green',
  cancelled: 'badge-yellow',
  expired: 'badge-red',
  pending: 'badge-blue',
  inactive: 'badge-gray',
  token: 'badge-gray',
  review: 'badge-yellow',
  success: 'badge-green',
  failed: 'badge-red',
  refunded: 'badge-yellow',
}

export default async function AdminSubscriptionsPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)
  const q = params.q ?? ''
  const statusFilter = params.status ?? ''
  const tab = params.tab ?? 'subscriptions'

  const [stats, subsResult, ordersResult] = await Promise.all([
    getAdminSubscriptionStats(),
    getAdminSubscriptions({ page, q, status: statusFilter || undefined }),
    getAdminOrders({ page }),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Subscriptions & Payments</h1>
        <p className="text-sm text-gray-500 mt-1">Monitor membership subscriptions and payment activity</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <StatCard
          label="Active"
          value={stats.active}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          accent
        />
        <StatCard
          label="Cancelled"
          value={stats.cancelled}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          }
        />
        <StatCard
          label="Expired"
          value={stats.expired}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Total Orders"
          value={stats.totalOrders}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <StatCard
          label="30-Day Revenue"
          value={`$${(stats.recentRevenue / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          accent
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 max-w-xs">
        <Link
          href="/admin/subscriptions"
          className={`flex-1 text-center text-sm font-medium py-2 px-4 rounded-md transition-colors ${
            tab !== 'orders' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Subscriptions
        </Link>
        <Link
          href="/admin/subscriptions?tab=orders"
          className={`flex-1 text-center text-sm font-medium py-2 px-4 rounded-md transition-colors ${
            tab === 'orders' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Orders
        </Link>
      </div>

      {tab !== 'orders' ? (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <form className="flex gap-2">
              <input name="q" defaultValue={q} placeholder="Search by name…" className="form-input max-w-xs" />
              <select name="status" defaultValue={statusFilter} className="form-input max-w-[160px]">
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
              </select>
              <button type="submit" className="btn-primary">Filter</button>
              {(q || statusFilter) && <Link href="/admin/subscriptions" className="btn-outline">Clear</Link>}
            </form>
          </div>

          {/* Subscriptions Table */}
          <div className="admin-card p-0 overflow-hidden">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Card</th>
                  <th>Start</th>
                  <th>End</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subsResult.subscriptions.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-gray-400 py-10">No subscriptions found.</td></tr>
                ) : subsResult.subscriptions.map((s: any) => {
                  const profile = s.user_profile
                  const name = profile
                    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.display_name || 'Unknown'
                    : 'Unknown'
                  return (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/admin/users/${s.user_id}`} className="font-medium text-primary hover:underline">
                          {name}
                        </Link>
                      </td>
                      <td className="text-sm text-gray-600">
                        {(s.membership_levels as any)?.name ?? `Level ${s.level_id}`}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGES[s.status] ?? 'badge-gray'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="text-sm text-gray-500">
                        {s.card_last4 ? `${s.card_type ?? '••••'} ${s.card_last4}` : '—'}
                      </td>
                      <td className="text-sm text-gray-500">{formatDate(s.startdate) || '—'}</td>
                      <td className="text-sm text-gray-500">{formatDate(s.enddate) || '—'}</td>
                      <td className="text-right">
                        <Link href={`/admin/users/${s.user_id}`} className="text-xs btn-outline py-1 px-2">
                          View
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <AdminPagination current={page} total={subsResult.total} perPage={subsResult.perPage} basePath="/admin/subscriptions" />
        </>
      ) : (
        <>
          {/* Orders Table */}
          <div className="admin-card p-0 overflow-hidden">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Member</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Gateway</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {ordersResult.orders.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-gray-400 py-10">No orders found.</td></tr>
                ) : ordersResult.orders.map((o: any) => {
                  const profile = o.user_profile
                  const name = profile
                    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.display_name || 'Unknown'
                    : 'Unknown'
                  return (
                    <tr key={o.id}>
                      <td className="text-sm font-mono text-gray-500">#{o.id}</td>
                      <td>
                        <Link href={`/admin/users/${o.user_id}`} className="font-medium text-primary hover:underline">
                          {name}
                        </Link>
                      </td>
                      <td className="text-sm text-gray-600">
                        {(o.membership_levels as any)?.name ?? '—'}
                      </td>
                      <td className="text-sm font-medium">
                        {o.total != null ? `$${(o.total / 100).toFixed(2)}` : '—'}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGES[o.status] ?? 'badge-gray'}`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="text-sm text-gray-500">{o.gateway || '—'}</td>
                      <td className="text-sm text-gray-500">{formatDate(o.timestamp) || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <AdminPagination current={page} total={ordersResult.total} perPage={ordersResult.perPage} basePath="/admin/subscriptions?tab=orders" />
        </>
      )}
    </div>
  )
}
