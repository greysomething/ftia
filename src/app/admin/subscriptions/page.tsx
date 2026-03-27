import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminSubscriptions, getAdminSubscriptionStats, getAdminOrders, getAdminMembershipPlans } from '@/lib/admin-queries'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { formatDate } from '@/lib/utils'
import { SubscriptionActions } from './SubscriptionActions'
import { StripeSyncButton } from '../users/StripeSyncButton'
import StripeStatsCards from './StripeStatsCards'

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

// TABS defined dynamically below with counts

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
    ...(stats.trialing > 0 ? [{ key: 'trialing', label: 'Trialing', count: stats.trialing }] : []),
    ...(stats.pastDue > 0 ? [{ key: 'past_due', label: 'Past Due', count: stats.pastDue }] : []),
    ...(stats.cancelled > 0 ? [{ key: 'cancelled', label: 'Cancelled', count: stats.cancelled }] : []),
    ...(stats.expired > 0 ? [{ key: 'expired', label: 'Expired', count: stats.expired }] : []),
    ...(stats.suspended > 0 ? [{ key: 'suspended', label: 'Suspended', count: stats.suspended }] : []),
    ...(stats.manual > 0 ? [{ key: 'manual', label: 'Manual', count: stats.manual }] : []),
  ]

  // Order status tabs with counts
  const orderTabs = [
    { key: '', label: 'All Orders', count: stats.totalOrders },
    { key: 'success', label: 'Successful', count: stats.orderCounts['success'] ?? 0 },
    ...(stats.orderCounts['refunded'] ? [{ key: 'refunded', label: 'Refunded', count: stats.orderCounts['refunded'] }] : []),
    ...(stats.orderCounts['failed'] ? [{ key: 'failed', label: 'Failed', count: stats.orderCounts['failed'] }] : []),
    ...((stats.orderCounts['dispute_opened'] || stats.orderCounts['dispute_lost']) ? [{
      key: 'dispute_opened',
      label: 'Disputed',
      count: (stats.orderCounts['dispute_opened'] ?? 0) + (stats.orderCounts['dispute_lost'] ?? 0),
    }] : []),
  ]

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscriptions & Payments</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor, modify, and manage membership subscriptions and payment activity
          </p>
        </div>
        <StripeSyncButton />
      </div>

      {/* Revenue & Stats Cards — powered by Stripe API */}
      <StripeStatsCards
        activeCount={stats.active}
        newThisMonth={stats.newThisMonth}
        needsAttention={stats.pastDue + stats.suspended}
        totalSubscriptions={stats.total}
        totalOrders={stats.totalOrders}
      />

      {/* Main Tabs: Subscriptions / Orders */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 max-w-sm">
        {[
          { key: 'subscriptions', label: 'Subscriptions', count: stats.total },
          { key: 'orders', label: 'Orders', count: stats.totalOrders },
        ].map((t) => {
          const isActive = tab === t.key || (tab !== 'orders' && t.key === 'subscriptions')
          return (
            <Link
              key={t.key}
              href={t.key === 'subscriptions' ? '/admin/subscriptions' : `/admin/subscriptions?tab=${t.key}`}
              className={`flex-1 text-center text-sm font-medium py-2 px-4 rounded-md transition-colors inline-flex items-center justify-center gap-2 ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-gray-100 text-gray-600' : 'bg-gray-200/60 text-gray-400'
              }`}>
                {t.count.toLocaleString()}
              </span>
            </Link>
          )
        })}
      </div>

      {tab !== 'orders' ? (
        <>
          {/* Status Filter Tabs */}
          <div className="flex flex-wrap gap-1 mb-4">
            {statusTabs.map((st) => {
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
                  <th>{statusFilter === 'cancelled' || statusFilter === 'expired' ? 'Expires' : 'Renews'}</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subsResult.subscriptions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-gray-400 py-10">
                      {q ? `No subscriptions matching "${q}"` : 'No subscriptions found.'}
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
            basePath={`/admin/subscriptions${statusFilter ? `?status=${statusFilter}` : ''}${q ? `${statusFilter ? '&' : '?'}q=${encodeURIComponent(q)}` : ''}`}
          />
        </>
      ) : (
        <>
          {/* Order Status Filter */}
          <div className="flex flex-wrap gap-1 mb-4">
            {orderTabs.map((st) => {
              if (st.count === 0 && st.key !== '') return null
              const isActiveFilter = orderStatus === st.key
              return (
                <Link
                  key={st.key}
                  href={`/admin/subscriptions?tab=orders${st.key ? `&order_status=${st.key}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                  className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${
                    isActiveFilter
                      ? 'bg-[#1B2A4A] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {st.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    isActiveFilter ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'
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
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th className="text-right">Stripe</th>
                </tr>
              </thead>
              <tbody>
                {ordersResult.orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-gray-400 py-10">
                      {q ? `No orders matching "${q}"` : 'No orders found.'}
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
                    const amount = o.total != null ? o.total.toFixed(2) : null

                    // Determine payment type from billing_reason
                    const billingType = o.billing_reason === 'subscription_create'
                      ? 'New Signup'
                      : o.billing_reason === 'subscription_cycle'
                        ? 'Renewal'
                        : o.status === 'refunded'
                          ? 'Refund'
                          : o.status === 'dispute_opened' || o.status === 'dispute_lost'
                            ? 'Dispute'
                            : null

                    const billingTypeColor = o.billing_reason === 'subscription_create'
                      ? 'text-blue-600 bg-blue-50'
                      : o.billing_reason === 'subscription_cycle'
                        ? 'text-gray-600 bg-gray-100'
                        : o.status === 'refunded'
                          ? 'text-amber-600 bg-amber-50'
                          : o.status === 'dispute_opened' || o.status === 'dispute_lost'
                            ? 'text-red-600 bg-red-50'
                            : ''

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
                        <td>
                          {billingType ? (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${billingTypeColor}`}>
                              {billingType}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
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
            basePath={`/admin/subscriptions?tab=orders${orderStatus ? `&order_status=${orderStatus}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          />
        </>
      )}
    </div>
  )
}
