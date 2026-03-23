import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminCompanies, getAdminCompanyCounts } from '@/lib/admin-queries'
import type { CompanySortField, SortDir } from '@/lib/admin-queries'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { formatDate, parsePhpSerializedFirst } from '@/lib/utils'
import { deleteCompany } from './actions'
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton'

export const metadata: Metadata = { title: 'Companies' }
export const dynamic = 'force-dynamic'

const VALID_SORT_FIELDS: CompanySortField[] = ['id', 'title', 'visibility', 'wp_updated_at']

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'publish', label: 'Published' },
  { key: 'draft', label: 'Draft' },
  { key: 'trash', label: 'Trash' },
] as const

interface Props {
  searchParams: Promise<{ page?: string; q?: string; sort?: string; dir?: string; status?: string }>
}

function SortHeader({ label, field, currentSort, currentDir, q, status, className }: {
  label: string; field: CompanySortField; currentSort: CompanySortField; currentDir: SortDir
  q: string; status: string; className?: string
}) {
  const isActive = currentSort === field
  const nextDir = isActive && currentDir === 'desc' ? 'asc' : 'desc'
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (status) params.set('status', status)
  params.set('sort', field)
  params.set('dir', nextDir)

  return (
    <th className={className}>
      <Link href={`/admin/companies?${params.toString()}`}
        className="inline-flex items-center gap-1 hover:text-primary transition-colors group">
        {label}
        <span className={`text-[10px] ${isActive ? 'text-primary' : 'text-gray-300 group-hover:text-gray-400'}`}>
          {isActive ? (currentDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </Link>
    </th>
  )
}

export default async function AdminCompaniesPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)
  const q = params.q ?? ''
  const status = params.status ?? ''
  const sort = (VALID_SORT_FIELDS.includes(params.sort as CompanySortField)
    ? params.sort : 'title') as CompanySortField
  const dir = (params.dir === 'desc' ? 'desc' : 'asc') as SortDir

  const [{ companies, total, perPage }, counts] = await Promise.all([
    getAdminCompanies({ page, q, sort, dir, visibility: status || undefined }),
    getAdminCompanyCounts(),
  ])

  const extraParams: Record<string, string> = {}
  if (q) extraParams.q = q
  if (status) extraParams.status = status
  if (sort !== 'title') extraParams.sort = sort
  if (dir !== 'asc') extraParams.dir = dir

  function tabHref(key: string) {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (key) p.set('status', key)
    if (sort !== 'title') p.set('sort', sort)
    if (dir !== 'asc') p.set('dir', dir)
    const qs = p.toString()
    return `/admin/companies${qs ? `?${qs}` : ''}`
  }

  const countMap: Record<string, number> = {
    '': counts.all, publish: counts.publish, draft: counts.draft, trash: counts.trash,
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
          <p className="text-sm text-gray-500 mt-1">{total.toLocaleString()} {status || 'total'}</p>
        </div>
        <Link href="/admin/companies/new" className="btn-primary">+ New Company</Link>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {STATUS_TABS.map(tab => {
          const isActive = status === tab.key
          const count = countMap[tab.key] ?? 0
          return (
            <Link key={tab.key} href={tabHref(tab.key)}
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

      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search companies…" className="form-input max-w-sm" />
        {status && <input type="hidden" name="status" value={status} />}
        <button type="submit" className="btn-primary">Search</button>
        {q && <Link href={tabHref(status)} className="btn-outline">Clear</Link>}
      </form>

      <div className="admin-card p-0 overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <SortHeader label="ID" field="id" currentSort={sort} currentDir={dir} q={q} status={status} className="w-16" />
              <SortHeader label="Name" field="title" currentSort={sort} currentDir={dir} q={q} status={status} />
              <th>Location</th>
              <SortHeader label="Visibility" field="visibility" currentSort={sort} currentDir={dir} q={q} status={status} />
              <SortHeader label="Updated" field="wp_updated_at" currentSort={sort} currentDir={dir} q={q} status={status} />
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-gray-400 py-10">No companies found.</td></tr>
            ) : companies.map((c: any) => {
              const location = parsePhpSerializedFirst(c.addresses)
              return (
                <tr key={c.id}>
                  <td className="text-gray-400 text-xs w-16">{c.id}</td>
                  <td>
                    <Link href={`/production-contact/${c.slug}`} target="_blank" className="font-medium text-primary hover:underline">
                      {c.title}
                    </Link>
                  </td>
                  <td className="text-sm text-gray-500 max-w-[200px] truncate">{location || '—'}</td>
                  <td>
                    <span className={`badge ${c.visibility === 'publish' ? 'badge-green' : c.visibility === 'members_only' ? 'badge-blue' : 'badge-gray'}`}>
                      {c.visibility === 'publish' ? 'Published' : c.visibility}
                    </span>
                  </td>
                  <td className="text-xs text-gray-500 whitespace-nowrap">{formatDate(c.wp_updated_at)}</td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/companies/${c.id}/edit`} className="text-xs btn-outline py-1 px-2">Edit</Link>
                      <form action={async () => { 'use server'; await deleteCompany(c.id) }}>
                        <ConfirmDeleteButton message="Delete this company?" />
                      </form>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <AdminPagination current={page} total={total} perPage={perPage} basePath="/admin/companies" extraParams={extraParams} />
    </div>
  )
}
