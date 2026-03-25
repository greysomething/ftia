import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAdminUserById } from '@/lib/admin-queries'
import { createAdminClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
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

  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.display_name || 'Unknown'
  const activeMembership = user.user_memberships?.find((m: any) => m.status === 'active')
  const hasStripe = user.user_memberships?.some((m: any) => m.stripe_subscription_id || m.stripe_customer_id)

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/users" className="text-sm text-gray-500 hover:text-primary">← Users</Link>
        <h1 className="text-2xl font-bold text-gray-900">{name}</h1>
        <span className={`badge ${user.role === 'admin' ? 'badge-purple' : 'badge-blue'}`}>
          {user.role === 'admin' ? 'Admin' : 'Member'}
        </span>
        {activeMembership && (
          <span className="badge badge-green">Active Subscription</span>
        )}
        {!activeMembership && !hasStripe && user.user_memberships?.length === 0 && (
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
                              Expires: <strong>{m.enddate ? formatDate(m.enddate) : 'Never'}</strong>
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
        </div>
      </div>
    </div>
  )
}
