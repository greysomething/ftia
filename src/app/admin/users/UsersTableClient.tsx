'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'

interface UserRow {
  id: string
  first_name: string | null
  last_name: string | null
  display_name: string | null
  email: string | null
  organization_name: string | null
  role: string | null
  wp_role: string | null
  country: string | null
  created_at: string
  user_memberships: Array<{
    status: string
    stripe_subscription_id: string | null
    membership_levels: { name: string } | null
  }> | null
}

export function UsersTableClient({ users, sortHeaders }: {
  users: UserRow[]
  sortHeaders: React.ReactNode
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [result, setResult] = useState<{ ok?: boolean; message?: string; error?: string } | null>(null)

  const nonAdminUsers = users.filter(u => u.role !== 'admin')
  const allSelected = nonAdminUsers.length > 0 && nonAdminUsers.every(u => selected.has(u.id))

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(nonAdminUsers.map(u => u.id)))
    }
  }

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return
    if (!confirm(
      `Permanently delete ${selected.size} user${selected.size > 1 ? 's' : ''}?\n\n` +
      'This will remove their:\n' +
      '• Auth account (login credentials)\n' +
      '• Profile data\n' +
      '• Membership records\n\n' +
      'This action cannot be undone.'
    )) return

    setDeleting(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/bulk-delete-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: Array.from(selected) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult({ error: data.error })
      } else {
        setResult(data)
        if (data.deleted > 0) {
          setTimeout(() => window.location.reload(), 1500)
        }
      }
    } catch {
      setResult({ error: 'Network error' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-red-800">
            {selected.size} user{selected.size > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={handleBulkDelete}
            disabled={deleting}
            className="bg-red-600 text-white px-4 py-1.5 rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            {deleting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Deleting…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Selected
              </>
            )}
          </button>
        </div>
      )}

      <div className="admin-card p-0 overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="w-10 px-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                  title="Select all non-admin users"
                />
              </th>
              {sortHeaders}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-gray-400 py-10">No users found.</td></tr>
            ) : users.map((u) => {
              const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.display_name || 'Unknown'
              const mem = u.user_memberships?.[0]
              const hasStripe = !!u.user_memberships?.some(m => m.stripe_subscription_id)
              const isAdmin = u.role === 'admin'

              return (
                <tr key={u.id} className={selected.has(u.id) ? 'bg-red-50/50' : ''}>
                  <td className="px-3">
                    {isAdmin ? (
                      <input type="checkbox" disabled className="rounded border-gray-200 opacity-30 cursor-not-allowed" title="Cannot delete admin accounts" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        onChange={() => toggle(u.id)}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">
                        {(u.first_name?.[0] ?? u.display_name?.[0] ?? '?').toUpperCase()}
                      </div>
                      <div>
                        <Link href={`/admin/users/${u.id}`} className="font-medium text-primary hover:underline text-sm">
                          {name}
                        </Link>
                        {u.email && (
                          <span className="block text-[11px] text-gray-400">{u.email}</span>
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
                        <div className="flex items-center gap-1">
                          <span className={`badge text-[11px] ${
                            mem.status === 'active' ? 'badge-green' :
                            mem.status === 'cancelled' ? 'badge-yellow' :
                            'badge-gray'
                          }`}>
                            {mem.status}
                          </span>
                          {!hasStripe && mem.status === 'active' && (
                            <span className="badge text-[10px] bg-amber-50 text-amber-700 border border-amber-200">
                              Manual
                            </span>
                          )}
                        </div>
                        {mem.membership_levels?.name && (
                          <span className="block text-[10px] text-gray-400 mt-0.5 truncate max-w-[140px]">
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

      {/* Result toast */}
      {result && (
        <div className={`fixed bottom-4 right-4 max-w-md p-4 rounded-lg shadow-lg z-50 ${
          result.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <p className={`text-sm font-medium ${result.ok ? 'text-green-800' : 'text-red-800'}`}>
            {result.message || result.error}
          </p>
          <button onClick={() => setResult(null)} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </>
  )
}
