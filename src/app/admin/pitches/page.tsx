import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminPitches, getAdminPitchCounts } from '@/lib/pitch-admin-queries'
import { getFeatureFlags } from '@/lib/feature-flags'
import { PITCH_FORMAT_LABELS, formatDate } from '@/lib/utils'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { adminTrashPitch } from './actions'

export const metadata: Metadata = {
  title: 'Pitches | Admin',
}

interface Props {
  searchParams: Promise<{ page?: string; q?: string; tab?: string; sort?: string; dir?: string }>
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'featured', label: 'Featured' },
  { key: 'trash', label: 'Trash' },
] as const

export default async function AdminPitchesPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page || '1', 10) || 1
  const q = params.q ?? ''
  const tab = params.tab ?? 'all'
  const sort = (params.sort ?? 'created_at') as any
  const dir = (params.dir ?? 'desc') as 'asc' | 'desc'

  const [{ pitches, total, perPage }, counts, flags] = await Promise.all([
    getAdminPitches({ page, q, tab, sort, dir }),
    getAdminPitchCounts(),
    getFeatureFlags(),
  ])

  const isTrash = tab === 'trash'

  function sortLink(field: string) {
    const newDir = sort === field && dir === 'asc' ? 'desc' : 'asc'
    const base = `/admin/pitches?tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ''}&sort=${field}&dir=${newDir}`
    return base
  }

  function sortIndicator(field: string) {
    if (sort !== field) return ''
    return dir === 'asc' ? ' \u2191' : ' \u2193'
  }

  return (
    <div>
      {/* Visibility banner — admin can curate before flipping the flag on. */}
      {!flags.pitch_marketplace_enabled && (
        <div className="mb-4 bg-amber-50 border border-amber-300 text-amber-900 text-sm rounded-lg px-4 py-3 flex items-center justify-between">
          <span>
            <strong>Pitch Marketplace is currently OFF for users.</strong>{' '}
            Only admins can see /pitches and the My Pitches area.
          </span>
          <Link href="/admin/site-settings" className="underline font-medium hover:text-amber-700 whitespace-nowrap ml-4">
            Open settings →
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pitches</h1>
          <p className="text-sm text-gray-500 mt-1">
            {counts.published} published, {counts.drafts} drafts
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
        {TABS.map(t => {
          const count = counts[t.key as keyof typeof counts] ?? 0
          const isActive = tab === t.key
          return (
            <Link
              key={t.key}
              href={`/admin/pitches?tab=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-[#3ea8c8] text-[#3ea8c8]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label}
              {count > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-[#3ea8c8]/10 text-[#3ea8c8]' : 'bg-gray-100 text-gray-500'
                }`}>
                  {count}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {/* Search */}
      <form className="mb-4 flex gap-2">
        <input type="hidden" name="tab" value={tab} />
        <input name="q" defaultValue={q} placeholder="Search pitches..." className="form-input max-w-sm" />
        <button type="submit" className="btn-primary text-sm">Search</button>
        {q && <Link href={`/admin/pitches?tab=${tab}`} className="btn-outline text-sm">Clear</Link>}
      </form>

      {/* Table */}
      {pitches.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          {q ? (
            <p>No pitches found matching &ldquo;{q}&rdquo;.</p>
          ) : tab === 'trash' ? (
            <p>No trashed pitches.</p>
          ) : tab === 'featured' ? (
            <p>No featured pitches.</p>
          ) : tab === 'drafts' ? (
            <p>No drafts.</p>
          ) : (
            <p>No pitches yet.</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500 text-xs uppercase tracking-wider">
                <th className="pb-3 pr-4 font-medium">
                  <Link href={sortLink('title')}>Title{sortIndicator('title')}</Link>
                </th>
                <th className="pb-3 pr-4 font-medium">Creator</th>
                <th className="pb-3 pr-4 font-medium">
                  <Link href={sortLink('format')}>Format{sortIndicator('format')}</Link>
                </th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 pr-4 font-medium text-center">Featured</th>
                <th className="pb-3 pr-4 font-medium text-right">
                  <Link href={sortLink('view_count')}>Views{sortIndicator('view_count')}</Link>
                </th>
                <th className="pb-3 pr-4 font-medium">
                  <Link href={sortLink('created_at')}>Date{sortIndicator('created_at')}</Link>
                </th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pitches.map((p: any) => {
                const creatorName =
                  p.user_profiles?.display_name ||
                  p.user_profiles?.first_name ||
                  'Unknown'

                const formatLabel =
                  PITCH_FORMAT_LABELS[p.format as keyof typeof PITCH_FORMAT_LABELS] || p.format

                let statusBadge: React.ReactNode
                if (p.visibility === 'publish') {
                  statusBadge = (
                    <span className="inline-block text-xs font-medium bg-green-100 text-green-700 rounded px-2 py-0.5">
                      Published
                    </span>
                  )
                } else if (p.visibility === 'private') {
                  statusBadge = (
                    <span className="inline-block text-xs font-medium bg-red-100 text-red-700 rounded px-2 py-0.5">
                      Trashed
                    </span>
                  )
                } else {
                  statusBadge = (
                    <span className="inline-block text-xs font-medium bg-gray-100 text-gray-600 rounded px-2 py-0.5">
                      Draft
                    </span>
                  )
                }

                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/pitches/${p.id}/edit`}
                        className="text-gray-900 font-medium hover:text-[#3ea8c8]"
                      >
                        {p.title}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-gray-600">{creatorName}</td>
                    <td className="py-3 pr-4">
                      <span className="inline-block text-xs font-medium bg-blue-50 text-blue-700 rounded px-2 py-0.5">
                        {formatLabel}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{statusBadge}</td>
                    <td className="py-3 pr-4 text-center">
                      {p.featured ? (
                        <span className="text-yellow-500" title="Featured">&#9733;</span>
                      ) : (
                        <span className="text-gray-300">&#9734;</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right text-gray-600">{p.view_count ?? 0}</td>
                    <td className="py-3 pr-4 text-gray-500">
                      {formatDate(p.published_at || p.created_at)}
                    </td>
                    <td className="py-3">
                      {!isTrash && (
                        <form action={adminTrashPitch.bind(null, p.id)}>
                          <button
                            type="submit"
                            className="text-red-500 hover:text-red-700 text-xs"
                          >
                            Trash
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination
        current={page}
        total={total}
        perPage={perPage}
        basePath={`/admin/pitches?tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ''}${sort !== 'created_at' ? `&sort=${sort}` : ''}${dir !== 'desc' ? `&dir=${dir}` : ''}`}
      />
    </div>
  )
}
