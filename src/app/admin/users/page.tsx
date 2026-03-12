import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminUsers } from '@/lib/admin-queries'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Users' }

interface Props {
  searchParams: Promise<{ page?: string; q?: string }>
}

export default async function AdminUsersPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)
  const q = params.q ?? ''

  const { users, total, perPage } = await getAdminUsers({ page, q })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">{total.toLocaleString()} total</p>
        </div>
      </div>

      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search by name…" className="form-input max-w-sm" />
        <button type="submit" className="btn-primary">Search</button>
        {q && <Link href="/admin/users" className="btn-outline">Clear</Link>}
      </form>

      <div className="admin-card p-0 overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Membership</th>
              <th>Joined</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-gray-400 py-10">No users found.</td></tr>
            ) : users.map((u: any) => {
              const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.display_name || 'Unknown'
              const membership = u.user_memberships?.[0]
              const hasActiveMembership = membership?.status === 'active'
              return (
                <tr key={u.id}>
                  <td>
                    <Link href={`/admin/users/${u.id}`} className="font-medium text-primary hover:underline">
                      {name}
                    </Link>
                    {u.display_name && u.display_name !== name && (
                      <span className="block text-xs text-gray-400">@{u.display_name}</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'badge-purple' : 'badge-gray'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    {hasActiveMembership ? (
                      <span className="badge badge-green">
                        Active — {membership.membership_levels?.name ?? 'Member'}
                      </span>
                    ) : (
                      <span className="badge badge-gray">No active membership</span>
                    )}
                  </td>
                  <td className="text-gray-500 text-sm">{formatDate(u.created_at)}</td>
                  <td className="text-right">
                    <Link href={`/admin/users/${u.id}`} className="text-xs btn-outline py-1 px-2">
                      Manage
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <AdminPagination current={page} total={total} perPage={perPage} basePath="/admin/users" />
    </div>
  )
}
