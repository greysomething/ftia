import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminUsers, getAdminUserCounts } from '@/lib/admin-queries'
import type { UserSortField, SortDir } from '@/lib/admin-queries'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { formatDate } from '@/lib/utils'
import { StripeSyncButton } from './StripeSyncButton'

export const metadata: Metadata = { title: 'Users' }
export const dynamic = 'force-dynamic'

const VALID_SORT: UserSortField[] = ['display_name', 'created_at', 'role']

const ROLE_TABS = [
  { key: '', label: 'All Users' },
  { key: 'admin', label: 'Admins' },
  { key: 'member', label: 'Members' },
] as const

const MEMBERSHIP_FILTERS = [
  { key: '', label: 'Any' },
  { key: 'active', label: 'Active' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'expired', label: 'Expired' },
  { key: 'none', label: 'No Membership' },
] as const

interface Props {
  searchParams: Promise<{
    page?: string; q?: string; role?: string; membership?: string
    sort?: string; dir?: string
  }>
}

function SortHeader({ label, field, currentSort, currentDir, basePath, extraParams, className }: {
  label: string; field: UserSortField; currentSort: UserSortField; currentDir: SortDir
  basePath: string; extraParams: Record<string, string>; className?: string
}) {
  const isActive = currentSort === field
  const nextDir = isActive && currentDir === 'desc' ? 'asc' : 'desc'
  const params = new URLSearchParams({ ...extraParams, sort: field, dir: nextDir })

  return (
    <th className={className}>
      <Link href={`${basePath}?${params.toString()}`}
        className="inline-flex items-center gap-1 hover:text-primary transition-colors group">
        {label}
        <span className={`text-[10px] ${isActive ? 'text-primary' : 'text-gray-300 group-hover:text-gray-400'}`}>
          {isActive ? (currentDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </Link>
    </th>
  )
}

export default async function AdminUsersPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)
  const q = params.q ?? ''
  const role = params.role ?? ''
  const membership = params.membership ?? ''
  const sort = (VALID_SORT.includes(params.sort as UserSortField) ? params.sort : 'created_at') as UserSortField
  const dir = (params.dir === 'asc' ? 'asc' : 'desc') as SortDir

  const [{ users, total, perPage }, counts] = await Promise.all([
    getAdminUsers({ page, q, role: role || undefined, membership: membership || undefined, sort, dir }),
    getAdminUserCounts(),
  ])

  const extraParams: Record<string, string> = {}
  if (q) extraParams.q = q
  if (role) extraParams.role = role
  if (membership) extraParams.membership = membership
  if (sort !== 'created_at') extraParams.sort = sort
  if (dir !== 'desc') extraParams.dir = dir

  function buildHref(overrides: Record<string, string>) {
    const p = new URLSearchParams({ ...extraParams, ...overrides })
    // Remove empty values
    for (const [k, v] of p.entries()) { if (!v) p.delete(k) }
    const qs = p.toString()
    return `/admin/users${qs ? `?${qs}` : ''}`
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">
            {counts.total.toLocaleString()} users &middot;{' '}
            {counts.activeMemberships} active members
          </p>
        </div>
        <StripeSyncButton />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Link href={buildHref({ role: '', membership: '' })} className="admin-card py-3 px-4 hover:shadow-md transition-shadow">
          <div className="text-2xl font-bold text-gray-900">{counts.total.toLocaleString()}</div>
          <div className="text-xs text-gray-500">Total Users</div>
        </Link>
        <Link href={buildHref({ role: 'admin', membership: '' })} className="admin-card py-3 px-4 hover:shadow-md transition-shadow">
          <div className="text-2xl font-bold text-purple-600">{counts.admins}</div>
          <div className="text-xs text-gray-500">Admins</div>
        </Link>
        <Link href={buildHref({ role: '', membership: 'active' })} className="admin-card py-3 px-4 hover:shadow-md transition-shadow">
          <div className="text-2xl font-bold text-green-600">{counts.activeMemberships}</div>
          <div className="text-xs text-gray-500">Active Members</div>
        </Link>
        <Link href={buildHref({ role: '', membership: 'cancelled' })} className="admin-card py-3 px-4 hover:shadow-md transition-shadow">
          <div className="text-2xl font-bold text-amber-600">{counts.cancelledMemberships}</div>
          <div className="text-xs text-gray-500">Cancelled</div>
        </Link>
        <Link href={buildHref({ role: '', membership: 'none' })} className="admin-card py-3 px-4 hover:shadow-md transition-shadow">
          <div className="text-2xl font-bold text-gray-400">{counts.noMembership.toLocaleString()}</div>
          <div className="text-xs text-gray-500">No Membership</div>
        </Link>
      </div>

      {/* Role tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {ROLE_TABS.map(tab => {
          const isActive = role === tab.key
          const count = tab.key === '' ? counts.total : tab.key === 'admin' ? counts.admins : counts.members
          return (
            <Link key={tab.key} href={buildHref({ role: tab.key, page: '' })}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                isActive ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              {tab.label}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}>{count.toLocaleString()}</span>
            </Link>
          )
        })}
      </div>

      {/* Search + Membership filter */}
      <div className="flex flex-wrap gap-3 mb-4">
        <form className="flex gap-2 flex-1 min-w-[300px]">
          <input name="q" defaultValue={q} placeholder="Search by name, organization…" className="form-input flex-1" />
          {role && <input type="hidden" name="role" value={role} />}
          {membership && <input type="hidden" name="membership" value={membership} />}
          <button type="submit" className="btn-primary">Search</button>
          {q && <Link href={buildHref({ q: '' })} className="btn-outline">Clear</Link>}
        </form>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Membership:</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {MEMBERSHIP_FILTERS.map(f => (
              <Link key={f.key} href={buildHref({ membership: f.key, page: '' })}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  membership === f.key
                    ? 'bg-primary text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                } ${f.key !== '' ? 'border-l border-gray-200' : ''}`}>
                {f.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Users table */}
      <div className="admin-card p-0 overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <SortHeader label="Name" field="display_name" currentSort={sort} currentDir={dir}
                basePath="/admin/users" extraParams={extraParams} />
              <th>Organization</th>
              <SortHeader label="Role" field="role" currentSort={sort} currentDir={dir}
                basePath="/admin/users" extraParams={extraParams} />
              <th>Membership</th>
              <th>Country</th>
              <SortHeader label="Joined" field="created_at" currentSort={sort} currentDir={dir}
                basePath="/admin/users" extraParams={extraParams} />
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-gray-400 py-10">No users found.</td></tr>
            ) : users.map((u: any) => {
              const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.display_name || 'Unknown'
              const mem = u.user_memberships?.[0]
              const hasStripe = !!u.user_memberships?.some((m: any) => m.stripe_subscription_id)

              return (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">
                        {(u.first_name?.[0] ?? u.display_name?.[0] ?? '?').toUpperCase()}
                      </div>
                      <div>
                        <Link href={`/admin/users/${u.id}`} className="font-medium text-primary hover:underline text-sm">
                          {name}
                        </Link>
                        {u.display_name && u.display_name !== name && (
                          <span className="block text-[11px] text-gray-400">{u.display_name}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="text-sm text-gray-500 max-w-[150px] truncate">{u.organization_name || '—'}</td>
                  <td>
                    <span className={`badge text-[11px] ${
                      u.role === 'admin' ? 'badge-purple' : 'badge-gray'
                    }`}>
                      {u.role ?? u.wp_role ?? 'subscriber'}
                    </span>
                  </td>
                  <td>
                    {mem ? (
                      <div>
                        <span className={`badge text-[11px] ${
                          mem.status === 'active' ? 'badge-green' :
                          mem.status === 'cancelled' ? 'badge-yellow' :
                          'badge-gray'
                        }`}>
                          {mem.status}
                        </span>
                        {mem.membership_levels?.name && (
                          <span className="block text-[10px] text-gray-400 mt-0.5 truncate max-w-[120px]">
                            {mem.membership_levels.name}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="text-xs text-gray-500">{u.country || '—'}</td>
                  <td className="text-xs text-gray-500 whitespace-nowrap">{formatDate(u.created_at)}</td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {hasStripe && (
                        <span title="Stripe connected" className="text-[#635BFF]">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.18l-.897 5.555C5.014 22.77 7.718 24 11.51 24c2.624 0 4.862-.649 6.334-1.838 1.588-1.28 2.397-3.178 2.397-5.637 0-4.145-2.543-5.827-6.266-7.376z"/>
                          </svg>
                        </span>
                      )}
                      <Link href={`/admin/users/${u.id}`} className="text-xs btn-outline py-1 px-2">
                        Manage
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <AdminPagination current={page} total={total} perPage={perPage} basePath="/admin/users" extraParams={extraParams} />
    </div>
  )
}
