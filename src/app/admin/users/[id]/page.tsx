import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAdminUserById } from '@/lib/admin-queries'
import { formatDate } from '@/lib/utils'
import { updateUserRole, updateMembershipStatus } from '../actions'

export const metadata: Metadata = { title: 'User Detail' }

interface Props { params: Promise<{ id: string }> }

export default async function AdminUserDetailPage({ params }: Props) {
  const { id } = await params
  const user = await getAdminUserById(id).catch(() => null)
  if (!user) notFound()

  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.display_name || 'Unknown'

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/users" className="text-sm text-gray-500 hover:text-primary">← Users</Link>
        <h1 className="text-2xl font-bold text-gray-900">{name}</h1>
        <span className={`badge ${user.role === 'admin' ? 'badge-purple' : 'badge-gray'}`}>{user.role}</span>
      </div>

      {/* Profile Info */}
      <div className="admin-card mb-4 space-y-3">
        <h2 className="font-semibold text-gray-700">Profile</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-gray-400">First Name</dt>
            <dd className="font-medium">{user.first_name || '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Last Name</dt>
            <dd className="font-medium">{user.last_name || '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Display Name</dt>
            <dd className="font-medium">{user.display_name || '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Joined</dt>
            <dd className="font-medium">{formatDate(user.created_at)}</dd>
          </div>
          <div>
            <dt className="text-gray-400">WP Role</dt>
            <dd className="font-medium">{user.wp_role || '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-400">UUID</dt>
            <dd className="font-mono text-xs text-gray-400 truncate">{user.id}</dd>
          </div>
        </dl>
      </div>

      {/* Change Role */}
      <div className="admin-card mb-4">
        <h2 className="font-semibold text-gray-700 mb-3">Change Role</h2>
        <div className="flex gap-2">
          <form action={async () => { 'use server'; await updateUserRole(user.id, 'admin') }}>
            <button
              type="submit"
              disabled={user.role === 'admin'}
              className="btn-primary text-sm disabled:opacity-50"
            >
              Set as Admin
            </button>
          </form>
          <form action={async () => { 'use server'; await updateUserRole(user.id, 'member') }}>
            <button
              type="submit"
              disabled={user.role === 'member'}
              className="btn-outline text-sm disabled:opacity-50"
            >
              Set as Member
            </button>
          </form>
        </div>
      </div>

      {/* Memberships */}
      <div className="admin-card">
        <h2 className="font-semibold text-gray-700 mb-3">Memberships</h2>
        {user.user_memberships?.length === 0 ? (
          <p className="text-sm text-gray-400">No memberships found.</p>
        ) : (
          <div className="space-y-3">
            {user.user_memberships?.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-100">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{m.membership_levels?.name ?? 'Unknown Plan'}</p>
                  <p className="text-xs text-gray-400">
                    {m.startdate && <>Started: {formatDate(m.startdate)} • </>}
                    Expires: {m.enddate ? formatDate(m.enddate) : 'Never'} •{' '}
                    <span className={`${m.status === 'active' ? 'text-green-600' : 'text-gray-400'}`}>
                      {m.status}
                    </span>
                  </p>
                  {(m.stripe_subscription_id || m.stripe_customer_id) && (
                    <div className="mt-1 space-y-0.5">
                      {m.stripe_customer_id && (
                        <p className="text-xs text-gray-400">
                          <span className="text-gray-500 font-medium">Stripe Customer:</span>{' '}
                          <a
                            href={`https://dashboard.stripe.com/customers/${m.stripe_customer_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-blue-500 hover:underline"
                          >
                            {m.stripe_customer_id}
                          </a>
                        </p>
                      )}
                      {m.stripe_subscription_id && (
                        <p className="text-xs text-gray-400">
                          <span className="text-gray-500 font-medium">Stripe Subscription:</span>{' '}
                          <a
                            href={`https://dashboard.stripe.com/subscriptions/${m.stripe_subscription_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-blue-500 hover:underline"
                          >
                            {m.stripe_subscription_id}
                          </a>
                        </p>
                      )}
                    </div>
                  )}
                  {m.card_type && m.card_last4 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      <span className="text-gray-500 font-medium">Card:</span>{' '}
                      {m.card_type} ending in {m.card_last4}
                      {m.card_exp_month && m.card_exp_year && ` (exp ${m.card_exp_month}/${m.card_exp_year})`}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {m.status !== 'active' && (
                    <form action={async () => { 'use server'; await updateMembershipStatus(m.id, 'active') }}>
                      <button type="submit" className="text-xs btn-primary py-1 px-2">Activate</button>
                    </form>
                  )}
                  {m.status === 'active' && (
                    <form action={async () => { 'use server'; await updateMembershipStatus(m.id, 'cancelled') }}>
                      <button type="submit" className="text-xs btn-danger py-1 px-2">Cancel</button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
