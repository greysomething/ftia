import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminSubscriptions, getAdminSubscriptionStats, getAdminOrders, getAdminMembershipPlans } from '@/lib/admin-queries'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { formatDate } from '@/lib/utils'
import { StatCard } from '@/components/admin/StatCard'
import { SubscriptionActions } from './SubscriptionActions'

export const metadata: Metadata = { title: 'Subscriptions & Payments' }

interface Props {
  searchParams: Promise<{ page?: string; q?: string; status?: string; tab?: string; order_status?: string }>
}

const STATUS_BADGES: Record<string, string> = {
  active: 'badge-green',
  trialing: 'badge-blue',
  past_due: 'badge-yellow',
  cancelled: 'badge-yellow',
  expired: 'badge-red',
  suspended: 'badge-red',
  pending: 'badge-blue',
  inactive: 'badge-gray',
  token: 'badge-gray',
  review: 'badge-yellow',
  success: 'badge-green',
  failed: 'badge-red',
  refunded: 'badge-yellow',
  dispute_opened: 'badge-red',
  dispute_won: 'badge-green',
  dispute_lost: 'badge-red',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  trialing: 'Trialing',
  past_due: 'Past Due',
  cancelled: 'Cancelled',
  expired: 'Expired',
  suspended: 'Suspended',
  pending: 'Pending',
  manual: 'Manual',
}

const TABS = [
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'orders', label: 'Orders' },
]

export default async function AdminSubscriptionsPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page || '1', 10) || 1
  const q = params.q ?? ''
  const statusFilter = params.status ?? ''
  const orderStatus = params.order_status ?? ''
  const tab = params.tab ?? 'subscriptions'

  const [stats, subsResult, ordersResult, plans] = await Promise.all([
    getAdminSubscriptionStats(),
    getAdminSubscriptions({ page, q, status: statusFilter || undefined }),
    getAdminOrders({ page, q, status: orderStatus || undefined }),
    getAdminMembershipPlans(),
  ])

  const activePlans = plans.filter((p: any) => p.stripe_price_id).map((p: any) => ({
    id: p.id,
    name: p.name,
    stripe_price_id: p.stripe_price_id,
    billing_amount: p.billing_amount,
    cycle_period: p.cycle_period,
  }))

  // Status tabs for subscriptions
  const statusTabs = [
    { key: '', label: 'All', count: stats.total },
    { key: 'active', label: 'Active', count: stats.active },
    { key: 'trialing', label: 'Trialing', count: stats.trialing },
    { key: 'past_due', label: 'Past Due', count: stats.pastDue },
    { key: 'cancelled', label: 'Cancelled', count: stats.cancelled },
    { key: 'expired', label: 'Expired', count: stats.expired },
    { key: 'suspended', label: 'Suspended', count: stats.suspended },
    { key: 'manual', label: 'Manual', count: stats.manual },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Subscriptions & Payments</h1>
        <p className="text-sm text-gray-500 mt-1">
          Monitor, modify, and manage membership subscriptions and payment activity
        </p>
      </div>

      {/* Revenue & Stats Cards */}
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
          label="Trialing"
          value={stats.trialing}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Past Due"
          value={stats.pastDue}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
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

      {/* Main Tabs: Subscriptions / Orders */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 max-w-xs">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === 'subscriptions' ? '/admin/subscriptions' : `/admin/subscriptions?tab=${t.key}`}
            className={`flex-1 text-center text-sm font-medium py-2 px-4 rounded-md transition-colors ${
              tab === t.key || (tab !== 'orders' && t.key === 'subscriptions')
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab !== 'orders' ? (
        <>
          {/* Status Filter Tabs */}
          <div className="flex flex-wrap gap-1 mb-4">
            {statusTabs.map((st) => {
              if (st.count === 0 && st.key !== '') return null
              const isActive = statusFilter === st.key
              return (
                <Link
                  key={st.key}
                  href={`/admin/subscriptions${st.key ? `?status=${st.key}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                  className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${
                    isActive
                      ? 'bg-[#1B2A4A] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {st.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {st.count}
                  </span>
                </Link>
              )
            })}
          </div>

          {/* Search */}
          <div className="mb-4">
            <form className="flex gap-2">
              <input
                name="q"
                defaultValue={q}
                placeholder="Search by name or email..."
                className="form-input max-w-sm"
              />
              {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
              <button type="submit" className="btn-primary">Search</button>
              {(q || statusFilter) && (
                <Link href="/admin/subscriptions" className="btn-outline">Clear</Link>
              )}
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
                  <th>Amount</th>
                  <th>Card</th>
                  <th>Started</th>
                  <th>{statusFilter === 'cancelled' ? 'Expires' : 'Renews'}</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subsResult.subscriptions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-gray-400 py-10">
                      No subscriptions found.
                    </td>
                  </tr>
                ) : (
                  subsResult.subscriptions.map((s: any) => {
                    const profile = s.user_profile
                    const name = profile
                      ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.display_name || 'Unknown'
                      : 'Unknown'
                    const email = profile?.email || s.billing_email || ''
                    const level = s.membership_levels as any
                    const amount = level?.billing_amount
                      ? `$${parseFloat(level.billing_amount).toFixed(2)}`
                      : '—'
                    const period = level?.cycle_period
                      ? `/${level.cycle_period.toLowerCase()}`
                      : ''
                    const isManual = s.status === 'active' && !s.stripe_subscription_id
                    const dateLabel =
                      s.status === 'cancelled' || s.status === 'expired'
                        ? 'Expires'
                        : 'Renews'

                    return (
                      <tr key={s.id}>
                        <td>
                          <Link
                            href={`/admin/users/${s.user_id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {name}
                          </Link>
                          {email && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{email}</p>
                          )}
                        </td>
                        <td className="text-sm text-gray-600">
                          {level?.name ?? `Level ${s.level_id}`}
                        </td>
                        <td>
                          <span className={`badge ${STATUS_BADGES[s.status] ?? 'badge-gray'}`}>
                            {STATUS_LABELS[s.status] ?? s.status}
                          </span>
                          {isManual && (
                            <span className="badge badge-gray ml-1 text-[10px]">Manual</span>
                          )}
                        </td>
                        <td className="text-sm font-medium text-gray-700">
                          {amount}{period}
                        </td>
                        <td className="text-sm text-gray-500">
                          {s.card_last4 ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="text-xs text-gray-400">{s.card_type ?? '****'}</span>
                              <span>{s.card_last4}</span>
                              {s.card_exp_month && s.card_exp_year && (
                                <span className="text-xs text-gray-400">
                                  {s.card_exp_month}/{s.card_exp_year}
                                </span>
                              )}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="text-sm text-gray-500">{formatDate(s.startdate) || '—'}</td>
                        <td className="text-sm text-gray-500">{formatDate(s.enddate) || '—'}</td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/admin/users/${s.user_id}`}
                              className="text-xs btn-outline py-1 px-2"
                            >
                              View
                            </Link>
                            <SubscriptionActions
                              membershipId={s.id}
                              subscriptionId={s.stripe_subscription_id}
                              status={s.status}
                              userName={name}
                              plans={activePlans}
                              currentLevelId={s.level_id}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <AdminPagination
            current={page}
            total={subsResult.total}
            perPage={subsResult.perPage}
            basePath={`/admin/subscriptions${statusFilter ? `?status=${statusFilter}` : ''}`}
          />
        </>
      ) : (
        <>
          {/* Order Status Filter */}
          <div className="flex flex-wrap gap-1 mb-4">
            {[
              { key: '', label: 'All Orders' },
              { key: 'success', label: 'Successful' },
              { key: 'refunded', label: 'Refunded' },
              { key: 'failed', label: 'Failed' },
              { key: 'dispute_opened', label: 'Disputed' },
            ].map((st) => {
              const isActiveFilter = orderStatus === st.key
              return (
                <Link
                  key={st.key}
                  href={`/admin/subscriptions?tab=orders${st.key ? `&order_status=${st.key}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                  className={`inline-flex items-center text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${
                    isActiveFilter
                      ? 'bg-[#1B2A4A] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {st.label}
                </Link>
              )
            })}
          </div>

          {/* Search */}
          <div className="mb-4">
            <form className="flex gap-2">
              <input type="hidden" name="tab" value="orders" />
              {orderStatus && <input type="hidden" name="order_status" value={orderStatus} />}
              <input
                name="q"
                defaultValue={q}
                placeholder="Search by name or email..."
                className="form-input max-w-sm"
              />
              <button type="submit" className="btn-primary">Search</button>
              {(q || orderStatus) && (
                <Link href="/admin/subscriptions?tab=orders" className="btn-outline">Clear</Link>
              )}
            </form>
          </div>

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
                  <th className="text-right">Stripe</th>
                </tr>
              </thead>
              <tbody>
                {ordersResult.orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-gray-400 py-10">
                      No orders found.
                    </td>
                  </tr>
                ) : (
                  ordersResult.orders.map((o: any) => {
                    const profile = o.user_profile
                    const name = profile
                      ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.display_name || 'Unknown'
                      : 'Unknown'
                    const email = profile?.email || ''
                    const isRefund = o.status === 'refunded' || o.status === 'dispute_lost'
                    const amount = o.total != null ? (o.total / 100).toFixed(2) : null

                    return (
                      <tr key={o.id}>
                        <td className="text-sm font-mono text-gray-500">#{o.id}</td>
                        <td>
                          <Link
                            href={`/admin/users/${o.user_id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {name}
                          </Link>
                          {email && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{email}</p>
                          )}
                        </td>
                        <td className="text-sm text-gray-600">
                          {(o.membership_levels as any)?.name ?? '—'}
                        </td>
                        <td className={`text-sm font-medium ${isRefund ? 'text-red-600' : 'text-gray-700'}`}>
                          {amount != null ? `${isRefund ? '-' : ''}$${amount}` : '—'}
                        </td>
                        <td>
                          <span className={`badge ${STATUS_BADGES[o.status] ?? 'badge-gray'}`}>
                            {o.status}
                          </span>
                          {o.notes && (
                            <p className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[140px]" title={o.notes}>
                              {o.notes}
                            </p>
                          )}
                        </td>
                        <td className="text-sm text-gray-500">{o.gateway || '—'}</td>
                        <td className="text-sm text-gray-500">{formatDate(o.timestamp) || '—'}</td>
                        <td className="text-right">
                          {o.payment_transaction_id ? (
                            <a
                              href={`https://dashboard.stripe.com/payments/${o.payment_transaction_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-[#3ea8c8] hover:underline"
                            >
                              View &rarr;
                            </a>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <AdminPagination
            current={page}
            total={ordersResult.total}
            perPage={ordersResult.perPage}
            basePath={`/admin/subscriptions?tab=orders${orderStatus ? `&order_status=${orderStatus}` : ''}`}
          />
        </>
      )}
    </div>
  )
}
