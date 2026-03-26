import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminProductions, getAdminProductionCounts } from '@/lib/admin-queries'
import type { ProductionSortField, SortDir } from '@/lib/admin-queries'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { ProductionsTableClient } from './ProductionsTableClient'

export const metadata: Metadata = { title: 'Productions' }
export const dynamic = 'force-dynamic'

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

export default async function AdminProductionsPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page || '1', 10) || 1
  const q = params.q ?? ''
  const status = params.status ?? ''
  const sort = (VALID_SORT_FIELDS.includes(params.sort as ProductionSortField)
    ? params.sort
    : 'created_at') as ProductionSortField
  const dir = (params.dir === 'asc' ? 'asc' : 'desc') as SortDir

  const [{ productions, total, perPage }, counts] = await Promise.all([
    getAdminProductions({ page, q, sort, dir, visibility: status || undefined }),
    getAdminProductionCounts(),
  ])

  const extraParams: Record<string, string> = {}
  if (q) extraParams.q = q
  if (status) extraParams.status = status
  if (sort !== 'created_at') extraParams.sort = sort
  if (dir !== 'desc') extraParams.dir = dir

  function tabHref(key: string) {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (key) p.set('status', key)
    if (sort !== 'created_at') p.set('sort', sort)
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
        {q && (() => {
          const cp = new URLSearchParams()
          if (status) cp.set('status', status)
          if (sort !== 'created_at') cp.set('sort', sort)
          if (dir !== 'desc') cp.set('dir', dir)
          const cqs = cp.toString()
          return <Link href={`/admin/productions${cqs ? `?${cqs}` : ''}`} className="btn-outline">Clear</Link>
        })()}
      </form>

      <ProductionsTableClient productions={productions} currentTab={status} />

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
