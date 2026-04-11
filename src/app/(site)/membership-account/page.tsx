import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import ChangePasswordForm from '@/components/ChangePasswordForm'

export const metadata: Metadata = {
  title: 'My Account | Production List',
}

export default async function MembershipAccountPage() {
  const user = await requireAuth()
  const supabase = await createClient()

  const [{ data: profile }, { data: membership }, { data: orders }] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('user_memberships')
      .select('*, membership_levels(name, cycle_period)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('membership_orders')
      .select('id, total, status, timestamp, membership_levels(name)')
      .eq('user_id', user.id)
      .order('timestamp', { ascending: false })
      .limit(5),
  ])

  const isCancelled = membership?.status === 'cancelled'
  const hasActiveMembership =
    (membership?.status === 'active' || isCancelled) &&
    (!membership?.enddate || new Date(membership.enddate) > new Date())

  return (
    <div className="page-wrap py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar nav */}
        <aside className="lg:w-56 flex-shrink-0">
          <nav className="white-bg p-4 space-y-1">
            {[
              ['My Account', '/membership-account'],
              ['My Pitches', '/membership-account/my-pitches'],
              ['My Submissions', '/membership-account/my-submissions'],
              ['Billing', '/membership-account/membership-billing'],
              ['Cancel', '/membership-account/membership-cancel'],
              ['Membership Plans', '/membership-plans'],
              ['Invoice', '/membership-account/membership-invoice'],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="block px-3 py-2 rounded text-sm text-gray-700 hover:bg-primary/10 hover:text-primary"
              >
                {label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <div className="flex-1 space-y-6">
          <div className="white-bg p-6">
            <h1 className="text-2xl font-bold text-primary mb-6">My Account</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-700">Profile</h2>
                  <Link
                    href="/membership-account/edit-profile"
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    Edit Profile
                  </Link>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <dt className="text-gray-500 w-28 flex-shrink-0">Name:</dt>
                    <dd>{[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Not set'}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500 w-28 flex-shrink-0">Email:</dt>
                    <dd>{user.email}</dd>
                  </div>
                  {(profile?.organization_type || profile?.custommer_job) && (
                    <div className="flex gap-2">
                      <dt className="text-gray-500 w-28 flex-shrink-0">Job Title:</dt>
                      <dd>{profile?.organization_type || profile?.custommer_job}</dd>
                    </div>
                  )}
                  {profile?.organization_name && (
                    <div className="flex gap-2">
                      <dt className="text-gray-500 w-28 flex-shrink-0">Company:</dt>
                      <dd>{profile.organization_name}</dd>
                    </div>
                  )}
                  {profile?.country && (
                    <div className="flex gap-2">
                      <dt className="text-gray-500 w-28 flex-shrink-0">Country:</dt>
                      <dd>{profile.country}</dd>
                    </div>
                  )}
                  {profile?.linkedin && (
                    <div className="flex gap-2">
                      <dt className="text-gray-500 w-28 flex-shrink-0">LinkedIn:</dt>
                      <dd>
                        <a href={profile.linkedin} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {profile.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '').replace(/\/$/, '') || 'View'}
                        </a>
                      </dd>
                    </div>
                  )}
                  {profile?.website && (
                    <div className="flex gap-2">
                      <dt className="text-gray-500 w-28 flex-shrink-0">Website:</dt>
                      <dd>
                        <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {profile.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
                {profile?.description && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <dt className="text-gray-500 text-xs uppercase tracking-wide mb-1">Bio</dt>
                    <dd className="text-sm text-gray-700">{profile.description}</dd>
                  </div>
                )}
              </div>

              <div>
                <h2 className="font-semibold text-gray-700 mb-3">Membership Status</h2>
                {hasActiveMembership ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isCancelled ? 'bg-yellow-500' : 'bg-green-500'}`}></span>
                      <span className={`font-medium ${isCancelled ? 'text-yellow-700' : 'text-green-700'}`}>
                        {isCancelled ? 'Cancelled' : 'Active'}
                      </span>
                    </div>
                    <p className="text-gray-600">{(membership as any)?.membership_levels?.name}</p>
                    {membership?.enddate && (
                      <p className="text-gray-500">
                        {isCancelled ? 'Expires' : 'Renews'}: {formatDate(membership.enddate)}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      <span className="text-red-700 font-medium">No active membership</span>
                    </div>
                    <Link href="/membership-plans" className="btn-accent text-sm">
                      View Plans
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className="white-bg p-6">
            <h2 className="font-semibold text-gray-700 mb-4">Change Password</h2>
            <ChangePasswordForm />
          </div>

          {/* Recent orders */}
          {orders && orders.length > 0 && (
            <div className="white-bg p-6">
              <h2 className="font-semibold text-gray-700 mb-4">Recent Payments</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 font-medium">Plan</th>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Amount</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order: any) => (
                    <tr key={order.id} className="border-b last:border-0">
                      <td className="py-2">{order.membership_levels?.name ?? 'Unknown'}</td>
                      <td className="py-2 text-gray-500">{formatDate(order.timestamp)}</td>
                      <td className="py-2">${order.total?.toFixed(2)}</td>
                      <td className="py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          order.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Link href="/membership-account/membership-invoice" className="text-sm text-primary hover:underline mt-3 block">
                View all invoices →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
