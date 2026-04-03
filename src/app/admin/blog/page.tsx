import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminBlogPosts, getAdminBlogCounts, getAllBlogCategories } from '@/lib/admin-queries'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { BlogTable } from './BlogTable'

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

export default async function AdminBlogPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page || '1', 10) || 1
  const q = params.q ?? ''
  const tab = params.tab ?? 'all'

  const [{ posts, total, perPage }, counts, categories] = await Promise.all([
    getAdminBlogPosts({ page, q, tab }),
    getAdminBlogCounts(),
    getAllBlogCategories(),
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

      {/* Table with bulk actions */}
      <BlogTable posts={posts} isTrash={isTrash} tab={tab} categories={categories} />

      <AdminPagination current={page} total={total} perPage={perPage} basePath={`/admin/blog?tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ''}`} />
    </div>
  )
}
