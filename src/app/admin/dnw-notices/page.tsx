import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminDnwNotices } from '@/lib/admin-queries'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { formatDate } from '@/lib/utils'
import { deleteDnwNotice } from './actions'

export const metadata: Metadata = { title: 'DNW Notices' }

interface Props {
  searchParams: Promise<{ page?: string; q?: string }>
}

export default async function AdminDnwNoticesPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page || '1', 10) || 1
  const q = params.q ?? ''

  const { notices, total, perPage } = await getAdminDnwNotices({ page, q })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Do Not Work Notices</h1>
          <p className="text-sm text-gray-500 mt-1">{total.toLocaleString()} notices</p>
        </div>
        <Link href="/admin/dnw-notices/new" className="btn-primary">+ New Notice</Link>
      </div>

      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search notices…" className="form-input max-w-sm" />
        <button type="submit" className="btn-primary">Search</button>
        {q && <Link href="/admin/dnw-notices" className="btn-outline">Clear</Link>}
      </form>

      <div className="admin-card p-0 overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Production</th>
              <th>Company</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {notices.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-gray-400 py-10">No notices found.</td></tr>
            ) : notices.map((n: any) => (
              <tr key={n.id}>
                <td className="text-gray-500 text-sm whitespace-nowrap">{formatDate(n.notice_date)}</td>
                <td className="font-medium text-gray-900">{n.production_title}</td>
                <td className="text-gray-600">{n.company_name}</td>
                <td>
                  <span className={`badge ${
                    n.status === 'active' ? 'badge-red' : 'badge-green'
                  }`}>
                    {n.status}
                  </span>
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={`/admin/dnw-notices/${n.id}/edit`} className="text-xs btn-outline py-1 px-2">Edit</Link>
                    <form action={async () => { 'use server'; await deleteDnwNotice(n.id) }}>
                      <button type="submit" className="text-xs btn-danger py-1 px-2"
                        onClick={(e) => { if (!confirm('Delete this notice?')) e.preventDefault() }}>
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AdminPagination current={page} total={total} perPage={perPage} basePath="/admin/dnw-notices" />
    </div>
  )
}
