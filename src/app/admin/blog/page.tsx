import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminBlogPosts, getAdminBlogCounts } from '@/lib/admin-queries'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { formatDate } from '@/lib/utils'
import { trashBlogPost, restoreBlogPost, deleteBlogPost } from './actions'
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton'

export const metadata: Metadata = { title: 'Blog' }

interface Props {
  searchParams: Promise<{ page?: string; q?: string; tab?: string }>
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'trash', label: 'Trash' },
] as const

function getStatusInfo(post: any) {
  const now = new Date()
  if (post.visibility === 'private') return { label: 'Trash', badge: 'bg-red-100 text-red-700' }
  if (post.visibility === 'draft') return { label: 'Draft', badge: 'bg-yellow-100 text-yellow-700' }
  if (post.visibility === 'publish' && post.published_at && new Date(post.published_at) > now) {
    return { label: 'Scheduled', badge: 'bg-blue-100 text-blue-700' }
  }
  if (post.visibility === 'publish') return { label: 'Published', badge: 'bg-green-100 text-green-700' }
  return { label: post.visibility, badge: 'bg-gray-100 text-gray-600' }
}

function formatScheduleDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

  const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  if (days > 0 && days <= 7) return `${formatted} at ${time} (in ${days}d)`
  return `${formatted} at ${time}`
}

export default async function AdminBlogPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page || '1', 10) || 1
  const q = params.q ?? ''
  const tab = params.tab ?? 'all'

  const [{ posts, total, perPage }, counts] = await Promise.all([
    getAdminBlogPosts({ page, q, tab }),
    getAdminBlogCounts(),
  ])

  const isTrash = tab === 'trash'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Blog</h1>
          <p className="text-sm text-gray-500 mt-1">
            {counts.published} published, {counts.drafts} drafts
            {counts.scheduled > 0 && `, ${counts.scheduled} scheduled`}
          </p>
        </div>
        <Link href="/admin/blog/new" className="btn-primary">+ New Post</Link>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
        {TABS.map(t => {
          const count = counts[t.key as keyof typeof counts] ?? 0
          const isActive = tab === t.key
          return (
            <Link
              key={t.key}
              href={`/admin/blog?tab=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
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
        <input name="q" defaultValue={q} placeholder="Search posts..." className="form-input max-w-sm" />
        <button type="submit" className="btn-primary text-sm">Search</button>
        {q && <Link href={`/admin/blog?tab=${tab}`} className="btn-outline text-sm">Clear</Link>}
      </form>

      {/* Table */}
      <div className="admin-card p-0 overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="w-16">ID</th>
              <th>Title</th>
              <th>Status</th>
              <th>{tab === 'scheduled' ? 'Publishes' : 'Date'}</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-gray-400 py-12">
                  {isTrash ? 'Trash is empty.' : q ? 'No posts matching your search.' : 'No posts yet.'}
                </td>
              </tr>
            ) : posts.map((p: any) => {
              const status = getStatusInfo(p)
              const isScheduled = status.label === 'Scheduled'
              return (
                <tr key={p.id} className={isTrash ? 'opacity-60' : ''}>
                  <td className="text-gray-400 text-xs">{p.id}</td>
                  <td>
                    <Link
                      href={`/admin/blog/${p.id}/edit`}
                      className="font-medium text-gray-900 hover:text-[#3ea8c8] transition-colors"
                    >
                      {p.title || <span className="italic text-gray-400">Untitled</span>}
                    </Link>
                    {p.visibility === 'publish' && !isScheduled && p.slug && (
                      <Link href={`/${p.slug}`} target="_blank"
                        className="ml-2 text-[10px] text-gray-400 hover:text-[#3ea8c8]">
                        View
                      </Link>
                    )}
                  </td>
                  <td>
                    <span className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${status.badge}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="text-sm text-gray-500">
                    {isScheduled && p.published_at ? (
                      <span className="text-blue-600 font-medium text-xs">
                        {formatScheduleDate(p.published_at)}
                      </span>
                    ) : p.published_at ? (
                      formatDate(p.published_at)
                    ) : (
                      <span className="text-gray-400 text-xs">
                        Created {formatDate(p.created_at)}
                      </span>
                    )}
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {isTrash ? (
                        <>
                          <form action={async () => { 'use server'; await restoreBlogPost(p.id) }}>
                            <button type="submit" className="text-xs btn-outline py-1 px-2 text-green-600 border-green-300 hover:bg-green-50">
                              Restore
                            </button>
                          </form>
                          <form action={async () => { 'use server'; await deleteBlogPost(p.id) }}>
                            <ConfirmDeleteButton message="Permanently delete this post? This cannot be undone." />
                          </form>
                        </>
                      ) : (
                        <>
                          <Link href={`/admin/blog/${p.id}/edit`} className="text-xs btn-outline py-1 px-2">Edit</Link>
                          <form action={async () => { 'use server'; await trashBlogPost(p.id) }}>
                            <ConfirmDeleteButton message="Move this post to trash?" />
                          </form>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <AdminPagination current={page} total={total} perPage={perPage} basePath={`/admin/blog?tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ''}`} />
    </div>
  )
}
