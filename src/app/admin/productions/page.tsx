import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminProductions } from '@/lib/admin-queries'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { PHASE_LABELS, PHASE_COLORS } from '@/lib/utils'
import { deleteProduction } from './actions'
import type { ProductionPhase } from '@/types/database'

export const metadata: Metadata = { title: 'Productions' }

interface Props {
  searchParams: Promise<{ page?: string; q?: string }>
}

export default async function AdminProductionsPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)
  const q = params.q ?? ''

  const { productions, total, perPage } = await getAdminProductions({ page, q })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productions</h1>
          <p className="text-sm text-gray-500 mt-1">{total.toLocaleString()} total</p>
        </div>
        <Link href="/admin/productions/new" className="btn-primary">
          + New Production
        </Link>
      </div>

      {/* Search */}
      <form className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search productions…"
          className="form-input max-w-sm"
        />
        <button type="submit" className="btn-primary">Search</button>
        {q && <Link href="/admin/productions" className="btn-outline">Clear</Link>}
      </form>

      <div className="admin-card p-0 overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Status</th>
              <th>Visibility</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {productions.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-gray-400 py-10">
                  No productions found.
                </td>
              </tr>
            ) : (
              productions.map((p: any) => {
                const phase: ProductionPhase = p.computed_status
                return (
                  <tr key={p.id}>
                    <td className="text-gray-400 text-xs w-16">{p.id}</td>
                    <td>
                      <Link
                        href={`/production/${p.slug}`}
                        target="_blank"
                        className="font-medium text-primary hover:underline"
                      >
                        {p.title}
                      </Link>
                    </td>
                    <td>
                      {phase ? (
                        <span className={`production-status-badge ${PHASE_COLORS[phase]}`}>
                          {PHASE_LABELS[phase]}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      <span className={`badge ${
                        p.visibility === 'publish' ? 'badge-green'
                          : p.visibility === 'members_only' ? 'badge-blue'
                          : 'badge-gray'
                      }`}>
                        {p.visibility === 'publish' ? 'Published' : p.visibility}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/productions/${p.id}/edit`}
                          className="text-xs btn-outline py-1 px-2"
                        >
                          Edit
                        </Link>
                        <form action={async () => { 'use server'; await deleteProduction(p.id) }}>
                          <button
                            type="submit"
                            className="text-xs btn-danger py-1 px-2"
                            onClick={(e) => { if (!confirm('Delete this production?')) e.preventDefault() }}
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination current={page} total={total} perPage={perPage} basePath="/admin/productions" />
    </div>
  )
}
