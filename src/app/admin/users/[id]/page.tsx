import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAdminUserById } from '@/lib/admin-queries'
import { createAdminClient } from '@/lib/supabase/server'
import { formatDate, formatDateTime } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import {
  updateUserRole,
  updateMembershipStatus,
  assignMembership,
  updateProfile,
} from '../actions'

export const metadata: Metadata = { title: 'User Detail' }

interface Props { params: Promise<{ id: string }> }

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
  expired: 'bg-yellow-100 text-yellow-800',
  inactive: 'bg-gray-100 text-gray-600',
  pending: 'bg-blue-100 text-blue-700',
  token: 'bg-purple-100 text-purple-700',
  review: 'bg-orange-100 text-orange-700',
  suspended: 'bg-red-100 text-red-800 ring-1 ring-red-300',
}

export default async function AdminUserDetailPage({ params }: Props) {
  const { id } = await params
  const user = await getAdminUserById(id).catch(() => null)
  if (!user) notFound()

  // Fetch membership levels for the assign dropdown
  const supabase = createAdminClient()
  const { data: levels } = await supabase
    .from('membership_levels')
    .select('id, name, is_active, billing_amount, cycle_period')
    .order('id')

  // Fetch user's auth email
  const { data: { user: authUser } } = await supabase.auth.admin.getUserById(id)
  const email = authUser?.email ?? null

  // Fetch recent activity
  const { data: recentActivity } = await supabase
    .from('activity_log')
    .select('id, event_type, ip_address, country, city, created_at')
    .eq('user_id', id)
    .order('created_at', { ascending: false })
    .limit(10)

  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.display_name || 'Unknown'
  const activeMembership = user.user_memberships?.find((m: any) => m.status === 'active')
  const suspendedMembership = user.user_memberships?.find((m: any) => m.status === 'suspended')
  const hasStripe = user.user_memberships?.some((m: any) => m.stripe_subscription_id || m.stripe_customer_id)

  // Fetch payment history
  const { data: paymentHistory } = await supabase
    .from('membership_orders')
    .select('id, level_id, status, total, gateway, payment_transaction_id, cardtype, accountnumber, notes, timestamp, membership_levels(name)')
    .eq('user_id', id)
    .order('timestamp', { ascending: false })
    .limit(50)

  const totalSpent = (paymentHistory ?? [])
    .filter((o: any) => o.status === 'success')
    .reduce((sum: number, o: any) => sum + (parseFloat(o.total) || 0), 0)
  const totalRefunded = (paymentHistory ?? [])
    .filter((o: any) => o.status === 'refunded')
    .reduce((sum: number, o: any) => sum + Math.abs(parseFloat(o.total) || 0), 0)

  // Fetch dispute-related orders for context
  let disputeNote: string | null = null
  if (suspendedMembership) {
    const { data: disputeOrders } = await supabase
      .from('membership_orders')
      .select('notes, status, timestamp')
      .eq('user_id', user.id)
      .in('status', ['dispute_opened', 'dispute_lost'])
      .order('timestamp', { ascending: false })
      .limit(1)
    disputeNote = disputeOrders?.[0]?.notes ?? null
  }

  return (
    <div className="max-w-4xl">
      {/* Dispute Banner */}
      {suspendedMembership && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-800">Account Suspended — Charge Dispute</h3>
              <p className="text-sm text-red-700 mt-1">
                This account has been automatically suspended due to a Stripe charge dispute (chargeback).
                Access is restricted until the dispute is resolved.
              </p>
              {disputeNote && (
                <p className="text-xs text-red-600 mt-2 font-mono bg-red-100/50 p-2 rounded">
                  {disputeNote}
                </p>
              )}
              <div className="flex gap-2 mt-3">
                <a
                  href={suspendedMembership.stripe_customer_id
                    ? `https://dashboard.stripe.com/customers/${suspendedMembership.stripe_customer_id}`
                    : 'https://dashboard.stripe.com/disputes'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-white border border-red-200 px-3 py-1.5 rounded hover:bg-red-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View in Stripe Dashboard
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/users" className="text-sm text-gray-500 hover:text-primary">← Users</Link>
        <h1 className="text-2xl font-bold text-gray-900">{name}</h1>
        <span className={`badge ${user.role === 'admin' ? 'badge-purple' : 'badge-blue'}`}>
          {user.role === 'admin' ? 'Admin' : 'Member'}
        </span>
        {suspendedMembership && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 ring-1 ring-red-300">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Suspended — Dispute
          </span>
        )}
        {activeMembership && !suspendedMembership && (
          <span className="badge badge-green">Active Subscription</span>
        )}
        {!activeMembership && !suspendedMembership && !hasStripe && user.user_memberships?.length === 0 && (
          <span className="badge badge-gray">Free User</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column — Profile & Role */}
        <div className="lg:col-span-2 space-y-4">
          {/* Editable Profile */}
          <form action={updateProfile}>
            <input type="hidden" name="userId" value={user.id} />
            <div className="admin-card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-700">Profile</h2>
                <button type="submit" className="btn-primary text-xs px-3 py-1.5">
                  Save Changes
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="form-label">First Name</label>
                  <input type="text" name="firstName" defaultValue={user.first_name || ''}
                    className="form-input" placeholder="First name" />
                </div>
                <div>
                  <label className="form-label">Last Name</label>
                  <input type="text" name="lastName" defaultValue={user.last_name || ''}
                    className="form-input" placeholder="Last name" />
                </div>
                <div>
                  <label className="form-label">Display Name</label>
                  <input type="text" name="displayName" defaultValue={user.display_name || ''}
                    className="form-input" placeholder="Display name" />
                </div>
                <div>
                  <label className="form-label">Email</label>
                  <input type="email" disabled value={email || '—'}
                    className="form-input bg-gray-50 text-gray-500 cursor-not-allowed" />
                </div>
                <div>
                  <label className="form-label">Organization</label>
                  <input type="text" name="organizationName" defaultValue={user.organization_name || ''}
                    className="form-input" placeholder="Company / Organization" />
                </div>
                <div>
                  <label className="form-label">Job Title / Role</label>
                  <input type="text" name="organizationType" defaultValue={user.organization_type || ''}
                    className="form-input" placeholder="e.g. Producer, Director" />
                </div>
                <div>
                  <label className="form-label">Country</label>
                  <input type="text" name="country" defaultValue={user.country || ''}
                    className="form-input" placeholder="Country" />
                </div>
                <div>
                  <label className="form-label">LinkedIn</label>
                  <input type="text" name="linkedin" defaultValue={user.linkedin || ''}
                    className="form-input" placeholder="linkedin.com/in/..." />
                </div>
                <div className="col-span-2">
                  <label className="form-label">Bio</label>
                  <textarea name="description" defaultValue={user.description || ''} rows={2}
                    className="form-input" placeholder="Short bio..." />
                </div>
              </div>

              {/* Meta info row */}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400 border-t pt-3">
                <span>Joined: {formatDate(user.wp_registered_at || user.created_at)}</span>
                {user.wp_role && <span>WP Role: {user.wp_role}</span>}
                <span className="font-mono">ID: {user.id}</span>
              </div>
            </div>
          </form>

          {/* Memberships */}
          <div className="admin-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700">Memberships</h2>
              {!hasStripe && activeMembership && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                  Manual assignment (no Stripe)
                </span>
              )}
            </div>

            {user.user_memberships?.length === 0 ? (
              <p className="text-sm text-gray-400 mb-4">No memberships found.</p>
            ) : (
              <div className="space-y-3 mb-4">
                {user.user_memberships?.map((m: any) => {
                  const isActive = m.status === 'active'
                  const hasStripeLink = m.stripe_subscription_id || m.stripe_customer_id
                  return (
                    <div key={m.id} className={`p-4 rounded-lg border ${
                      isActive ? 'border-green-200 bg-green-50/50' : 'border-gray-200 bg-gray-50'
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-sm text-gray-900">
                              {m.membership_levels?.name ?? 'Unknown Plan'}
                            </p>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              STATUS_STYLES[m.status] ?? 'bg-gray-100 text-gray-600'
                            }`}>
                              {m.status}
                            </span>
                            {!hasStripeLink && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                Manual
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
                            {m.startdate && (
                              <span>Started: <strong>{formatDate(m.startdate)}</strong></span>
                            )}
                            <span>
                              {m.status === 'active' || m.status === 'trialing' ? 'Renews' : 'Expires'}:{' '}
                              <strong>{m.enddate ? formatDate(m.enddate) : 'Never'}</strong>
                            </span>
                          </div>

                          {/* Stripe links */}
                          {hasStripeLink && (
                            <div className="flex flex-wrap gap-3 mt-2">
                              {m.stripe_customer_id && (
                                <a
                                  href={`https://dashboard.stripe.com/customers/${m.stripe_customer_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                  Customer: {m.stripe_customer_id}
                                </a>
                              )}
                              {m.stripe_subscription_id && (
                                <a
                                  href={`https://dashboard.stripe.com/subscriptions/${m.stripe_subscription_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                  Subscription: {m.stripe_subscription_id}
                                </a>
                              )}
                            </div>
                          )}

                          {m.card_type && m.card_last4 && (
                            <p className="text-xs text-gray-400 mt-1">
                              {m.card_type} ending in XXXX-XXXX-XXXX-{m.card_last4}
                              {m.card_exp_month && m.card_exp_year && ` (exp ${String(m.card_exp_month).padStart(2, '0')}/${m.card_exp_year})`}
                            </p>
                          )}
                        </div>

                        {/* Status actions */}
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          {!isActive && (
                            <form action={async () => { 'use server'; await updateMembershipStatus(m.id, 'active', user.id) }}>
                              <button type="submit" className="btn-primary text-xs py-1.5 px-3 w-full">
                                Activate
                              </button>
                            </form>
                          )}
                          {isActive && (
                            <form action={async () => { 'use server'; await updateMembershipStatus(m.id, 'cancelled', user.id) }}>
                              <button type="submit" className="btn-outline text-xs py-1.5 px-3 w-full text-red-600 border-red-200 hover:bg-red-50">
                                Cancel
                              </button>
                            </form>
                          )}
                          {m.status !== 'expired' && (
                            <form action={async () => { 'use server'; await updateMembershipStatus(m.id, 'expired', user.id) }}>
                              <button type="submit" className="btn-outline text-xs py-1.5 px-3 w-full text-yellow-700 border-yellow-200 hover:bg-yellow-50">
                                Expire
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Assign New Membership */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Assign Membership</h3>
              <p className="text-xs text-gray-400 mb-3">
                Manually assign a membership plan. This will NOT create a Stripe subscription — the membership will be marked as &quot;Manual&quot;.
              </p>
              <form action={assignMembership} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="userId" value={user.id} />
                <div className="flex-1 min-w-[180px]">
                  <label className="form-label">Plan</label>
                  <select name="levelId" required className="form-input text-sm">
                    <option value="">Select a plan...</option>
                    {levels?.filter((l: any) => l.is_active).map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {l.name} — ${l.billing_amount}/{l.cycle_period}
                      </option>
                    ))}
                    <optgroup label="Inactive Plans">
                      {levels?.filter((l: any) => !l.is_active).map((l: any) => (
                        <option key={l.id} value={l.id}>
                          {l.name} — ${l.billing_amount}/{l.cycle_period}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div className="w-[130px]">
                  <label className="form-label">Duration</label>
                  <select name="duration" className="form-input text-sm">
                    <option value="1m">1 Month</option>
                    <option value="3m">3 Months</option>
                    <option value="6m">6 Months</option>
                    <option value="1y" selected>1 Year</option>
                    <option value="lifetime">Lifetime</option>
                  </select>
                </div>
                <button type="submit" className="btn-primary text-sm py-2 px-4">
                  Assign Plan
                </button>
              </form>
            </div>
          </div>
          {/* Payment History */}
          <div className="admin-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700">Payment History</h2>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-500">
                  Total: <strong className="text-green-600">${totalSpent.toFixed(2)}</strong>
                </span>
                {totalRefunded > 0 && (
                  <span className="text-gray-500">
                    Refunded: <strong className="text-red-600">${totalRefunded.toFixed(2)}</strong>
                  </span>
                )}
              </div>
            </div>

            {!paymentHistory || paymentHistory.length === 0 ? (
              <p className="text-sm text-gray-400">No payment records found. Run &quot;Sync Memberships from Stripe&quot; to backfill payment history.</p>
            ) : (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b">
                      <th className="text-left pb-2 font-medium">Date</th>
                      <th className="text-left pb-2 font-medium">Plan</th>
                      <th className="text-left pb-2 font-medium">Status</th>
                      <th className="text-right pb-2 font-medium">Amount</th>
                      <th className="text-left pb-2 font-medium">Card</th>
                      <th className="text-left pb-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paymentHistory.map((order: any) => {
                      const orderStatusStyles: Record<string, string> = {
                        success: 'bg-green-100 text-green-800',
                        refunded: 'bg-red-100 text-red-700',
                        dispute_opened: 'bg-red-100 text-red-800',
                        dispute_won: 'bg-green-100 text-green-800',
                        dispute_lost: 'bg-red-100 text-red-800',
                        failed: 'bg-yellow-100 text-yellow-800',
                      }
                      const amount = parseFloat(order.total) || 0
                      const isNegative = amount < 0
                      return (
                        <tr key={order.id} className="text-xs">
                          <td className="py-2 whitespace-nowrap text-gray-600">
                            {order.timestamp ? formatDate(order.timestamp) : '—'}
                          </td>
                          <td className="py-2 text-gray-700">
                            {(order.membership_levels as any)?.name ?? '—'}
                          </td>
                          <td className="py-2">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              orderStatusStyles[order.status] ?? 'bg-gray-100 text-gray-600'
                            }`}>
                              {order.status === 'success' ? 'Paid' : order.status?.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className={`py-2 text-right font-medium whitespace-nowrap ${
                            isNegative ? 'text-red-600' : 'text-gray-900'
                          }`}>
                            {isNegative ? '-' : ''}${Math.abs(amount).toFixed(2)}
                          </td>
                          <td className="py-2 text-gray-500 whitespace-nowrap">
                            {order.cardtype && order.accountnumber
                              ? `${order.cardtype} ••${order.accountnumber}`
                              : '—'}
                          </td>
                          <td className="py-2 text-gray-400 truncate max-w-[150px]" title={order.notes ?? ''}>
                            {order.payment_transaction_id ? (
                              <a
                                href={`https://dashboard.stripe.com/payments/${order.payment_transaction_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:underline"
                              >
                                {order.notes || 'View in Stripe'}
                              </a>
                            ) : (
                              order.notes || '—'
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right column — Role & Quick Info */}
        <div className="space-y-4">
          {/* System Role Card */}
          <div className="admin-card">
            <h2 className="font-semibold text-gray-700 mb-3">System Role</h2>
            <div className="space-y-2">
              <form action={async () => { 'use server'; await updateUserRole(user.id, 'admin') }}>
                <button
                  type="submit"
                  disabled={user.role === 'admin'}
                  className={`w-full text-left p-3 rounded-lg border-2 text-sm transition-all ${
                    user.role === 'admin'
                      ? 'border-purple-500 bg-purple-50 text-purple-900'
                      : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/50 text-gray-600 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      user.role === 'admin' ? 'border-purple-500' : 'border-gray-300'
                    }`}>
                      {user.role === 'admin' && (
                        <div className="w-2 h-2 rounded-full bg-purple-500" />
                      )}
                    </div>
                    <span className="font-semibold">Admin</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 ml-6">Full access to admin panel, can manage users, content, and settings</p>
                </button>
              </form>

              <form action={async () => { 'use server'; await updateUserRole(user.id, 'member') }}>
                <button
                  type="submit"
                  disabled={user.role === 'member'}
                  className={`w-full text-left p-3 rounded-lg border-2 text-sm transition-all ${
                    user.role === 'member'
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 text-gray-600 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      user.role === 'member' ? 'border-blue-500' : 'border-gray-300'
                    }`}>
                      {user.role === 'member' && (
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                      )}
                    </div>
                    <span className="font-semibold">Member</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 ml-6">Standard user with access based on membership level</p>
                </button>
              </form>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="admin-card">
            <h2 className="font-semibold text-gray-700 mb-3">Account Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="font-medium text-gray-900 truncate ml-2">{email || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={`font-medium ${activeMembership ? 'text-green-600' : 'text-gray-400'}`}>
                  {activeMembership ? 'Active Subscriber' : 'No Active Plan'}
                </span>
              </div>
              {activeMembership && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Current Plan</span>
                  <span className="font-medium text-gray-900">
                    {activeMembership.membership_levels?.name ?? '—'}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Total Memberships</span>
                <span className="font-medium text-gray-900">{user.user_memberships?.length ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Payments</span>
                <span className="font-medium text-gray-900">{paymentHistory?.filter((o: any) => o.status === 'success').length ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Lifetime Value</span>
                <span className="font-medium text-green-600">${totalSpent.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Stripe Linked</span>
                <span className={`font-medium ${hasStripe ? 'text-green-600' : 'text-amber-600'}`}>
                  {hasStripe ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Registered</span>
                <span className="font-medium text-gray-900">{formatDate(user.wp_registered_at || user.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          {recentActivity && recentActivity.length > 0 && (
            <div className="admin-card overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-700">Recent Activity</h2>
                <a href={`/admin/login-log?search=${encodeURIComponent(email || '')}`} className="text-xs text-primary hover:underline">
                  View All
                </a>
              </div>
              <div className="space-y-2">
                {recentActivity.map((entry: any) => {
                  const eventLabels: Record<string, { label: string; color: string }> = {
                    login: { label: 'Login', color: 'bg-green-100 text-green-800' },
                    login_failed: { label: 'Failed', color: 'bg-red-100 text-red-800' },
                    register: { label: 'Register', color: 'bg-blue-100 text-blue-800' },
                    password_reset: { label: 'Reset', color: 'bg-yellow-100 text-yellow-800' },
                    pdf_download: { label: 'PDF', color: 'bg-purple-100 text-purple-800' },
                    profile_update: { label: 'Profile', color: 'bg-indigo-100 text-indigo-800' },
                    logout: { label: 'Logout', color: 'bg-gray-100 text-gray-600' },
                    contact_form: { label: 'Contact', color: 'bg-teal-100 text-teal-800' },
                  }
                  const evt = eventLabels[entry.event_type] ?? { label: entry.event_type, color: 'bg-gray-100 text-gray-600' }
                  const location = [entry.city, entry.country].filter(Boolean).join(', ')
                  return (
                    <div key={entry.id} className="flex items-center gap-2 text-xs min-w-0">
                      <span className={`inline-flex flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${evt.color}`}>
                        {evt.label}
                      </span>
                      <span className="font-mono text-gray-500 truncate flex-shrink min-w-0">{entry.ip_address ?? '—'}</span>
                      {location && <span className="text-gray-400 truncate flex-shrink min-w-0">{location}</span>}
                      <span className="ml-auto text-gray-400 whitespace-nowrap flex-shrink-0" title={formatDateTime(entry.created_at)}>
                        {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
