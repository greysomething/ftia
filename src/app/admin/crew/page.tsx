import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminCrew } from '@/lib/admin-queries'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { deleteCrew } from './actions'
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton'

export const metadata: Metadata = { title: 'Crew' }

interface Props {
  searchParams: Promise<{ page?: string; q?: string }>
}

export default async function AdminCrewPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)
  const q = params.q ?? ''

  const { crew, total, perPage } = await getAdminCrew({ page, q })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Crew</h1>
          <p className="text-sm text-gray-500 mt-1">{total.toLocaleString()} total</p>
        </div>
        <Link href="/admin/crew/new" className="btn-primary">+ New Crew</Link>
      </div>

      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search crew…" className="form-input max-w-sm" />
        <button type="submit" className="btn-primary">Search</button>
        {q && <Link href="/admin/crew" className="btn-outline">Clear</Link>}
      </form>

      <div className="admin-card p-0 overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Visibility</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {crew.length === 0 ? (
              <tr><td colSpan={4} className="text-center text-gray-400 py-10">No crew found.</td></tr>
            ) : crew.map((c: any) => (
              <tr key={c.id}>
                <td className="text-gray-400 text-xs w-16">{c.id}</td>
                <td>
                  <Link href={`/production-role/${c.slug}`} target="_blank" className="font-medium text-primary hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td>
                  <span className={`badge ${c.visibility === 'publish' ? 'badge-green' : c.visibility === 'members_only' ? 'badge-blue' : 'badge-gray'}`}>
                    {c.visibility === 'publish' ? 'Published' : c.visibility}
                  </span>
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={`/admin/crew/${c.id}/edit`} className="text-xs btn-outline py-1 px-2">Edit</Link>
                    <form action={async () => { 'use server'; await deleteCrew(c.id) }}>
                      <ConfirmDeleteButton message="Delete this crew member?" />
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AdminPagination current={page} total={total} perPage={perPage} basePath="/admin/crew" />
    </div>
  )
}
