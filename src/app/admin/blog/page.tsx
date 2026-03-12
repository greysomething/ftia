import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminBlogPosts } from '@/lib/admin-queries'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { formatDate } from '@/lib/utils'
import { deleteBlogPost } from './actions'

export const metadata: Metadata = { title: 'Blog' }

interface Props {
  searchParams: Promise<{ page?: string; q?: string }>
}

export default async function AdminBlogPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)
  const q = params.q ?? ''

  const { posts, total, perPage } = await getAdminBlogPosts({ page, q })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Blog</h1>
          <p className="text-sm text-gray-500 mt-1">{total.toLocaleString()} posts</p>
        </div>
        <Link href="/admin/blog/new" className="btn-primary">+ New Post</Link>
      </div>

      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search posts…" className="form-input max-w-sm" />
        <button type="submit" className="btn-primary">Search</button>
        {q && <Link href="/admin/blog" className="btn-outline">Clear</Link>}
      </form>

      <div className="admin-card p-0 overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Status</th>
              <th>Published</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-gray-400 py-10">No posts found.</td></tr>
            ) : posts.map((p: any) => (
              <tr key={p.id}>
                <td className="text-gray-400 text-xs w-16">{p.id}</td>
                <td>
                  <Link href={`/blog/${p.slug}`} target="_blank" className="font-medium text-primary hover:underline">
                    {p.title}
                  </Link>
                </td>
                <td>
                  <span className={`badge ${
                    p.status === 'published' ? 'badge-green'
                      : p.status === 'scheduled' ? 'badge-yellow'
                      : 'badge-gray'
                  }`}>
                    {p.status}
                  </span>
                </td>
                <td className="text-gray-500 text-sm">{formatDate(p.published_at) || '—'}</td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={`/admin/blog/${p.id}/edit`} className="text-xs btn-outline py-1 px-2">Edit</Link>
                    <form action={async () => { 'use server'; await deleteBlogPost(p.id) }}>
                      <button type="submit" className="text-xs btn-danger py-1 px-2"
                        onClick={(e) => { if (!confirm('Delete this post?')) e.preventDefault() }}>
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

      <AdminPagination current={page} total={total} perPage={perPage} basePath="/admin/blog" />
    </div>
  )
}
