import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminProductions, getAdminProductionCounts } from '@/lib/admin-queries'
import type { ProductionSortField, SortDir } from '@/lib/admin-queries'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { PHASE_LABELS, PHASE_COLORS, formatDate } from '@/lib/utils'
import { deleteProduction } from './actions'
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton'
import type { ProductionPhase } from '@/types/database'

export const metadata: Metadata = { title: 'Productions' }

const VALID_SORT_FIELDS: ProductionSortField[] = [
  'id', 'title', 'computed_status', 'visibility',
  'production_date_start', 'wp_updated_at', 'created_at',
]

interface Props {
  searchParams: Promise<{ page?: string; q?: string; sort?: string; dir?: string; status?: string }>
}

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'publish', label: 'Published' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending', label: 'Pending' },
  { key: 'trash', label: 'Trash' },
] as const

function SortHeader({
  label,
  field,
  currentSort,
  currentDir,
  q,
  className,
}: {
  label: string
  field: ProductionSortField
  currentSort: ProductionSortField
  currentDir: SortDir
  q: string
  className?: string
}) {
  const isActive = currentSort === field
  const nextDir = isActive && currentDir === 'desc' ? 'asc' : 'desc'
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  params.set('sort', field)
  params.set('dir', nextDir)

  return (
    <th className={className}>
      <Link
        href={`/admin/productions?${params.toString()}`}
        className="inline-flex items-center gap-1 hover:text-primary transition-colors group"
      >
        {label}
        <span className={`text-[10px] ${isActive ? 'text-primary' : 'text-gray-300 group-hover:text-gray-400'}`}>
          {isActive ? (currentDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </Link>
    </th>
  )
}

export default async function AdminProductionsPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)
  const q = params.q ?? ''
  const status = params.status ?? ''
  const sort = (VALID_SORT_FIELDS.includes(params.sort as ProductionSortField)
    ? params.sort
    : 'wp_updated_at') as ProductionSortField
  const dir = (params.dir === 'asc' ? 'asc' : 'desc') as SortDir

  const [{ productions, total, perPage }, counts] = await Promise.all([
    getAdminProductions({ page, q, sort, dir, visibility: status || undefined }),
    getAdminProductionCounts(),
  ])

  const extraParams: Record<string, string> = {}
  if (q) extraParams.q = q
  if (status) extraParams.status = status
  if (sort !== 'wp_updated_at') extraParams.sort = sort
  if (dir !== 'desc') extraParams.dir = dir

  function tabHref(key: string) {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (key) p.set('status', key)
    if (sort !== 'wp_updated_at') p.set('sort', sort)
    if (dir !== 'desc') p.set('dir', dir)
    const qs = p.toString()
    return `/admin/productions${qs ? `?${qs}` : ''}`
  }

  const countMap: Record<string, number> = {
    '': counts.all,
    publish: counts.publish,
    draft: counts.draft,
    pending: counts.pending,
    trash: counts.trash,
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productions</h1>
          <p className="text-sm text-gray-500 mt-1">{total.toLocaleString()} {status ? `${status}` : 'total'}</p>
        </div>
        <Link href="/admin/productions/new" className="btn-primary">
          + New Production
        </Link>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {STATUS_TABS.map(tab => {
          const isActive = status === tab.key
          const count = countMap[tab.key] ?? 0
          return (
            <Link
              key={tab.key}
              href={tabHref(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {count.toLocaleString()}
              </span>
            </Link>
          )
        })}
      </div>

      {/* Search */}
      <form className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search productions…"
          className="form-input max-w-sm"
        />
        {status && <input type="hidden" name="status" value={status} />}
        <button type="submit" className="btn-primary">Search</button>
        {q && <Link href={tabHref(status)} className="btn-outline">Clear</Link>}
      </form>

      <div className="admin-card p-0 overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <SortHeader label="ID" field="id" currentSort={sort} currentDir={dir} q={q} className="w-16" />
              <SortHeader label="Title" field="title" currentSort={sort} currentDir={dir} q={q} />
              <SortHeader label="Status" field="computed_status" currentSort={sort} currentDir={dir} q={q} />
              <SortHeader label="Visibility" field="visibility" currentSort={sort} currentDir={dir} q={q} />
              <SortHeader label="Start Date" field="production_date_start" currentSort={sort} currentDir={dir} q={q} />
              <SortHeader label="Updated" field="wp_updated_at" currentSort={sort} currentDir={dir} q={q} />
              <SortHeader label="Added" field="created_at" currentSort={sort} currentDir={dir} q={q} />
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {productions.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-gray-400 py-10">
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
                    <td className="text-xs text-gray-500 whitespace-nowrap">
                      {p.production_date_start || '—'}
                    </td>
                    <td className="text-xs text-gray-500 whitespace-nowrap">
                      {formatDate(p.wp_updated_at)}
                    </td>
                    <td className="text-xs text-gray-500 whitespace-nowrap">
                      {formatDate(p.created_at)}
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
                          <ConfirmDeleteButton message="Delete this production?" />
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

      <AdminPagination
        current={page}
        total={total}
        perPage={perPage}
        basePath="/admin/productions"
        extraParams={extraParams}
      />
    </div>
  )
}
