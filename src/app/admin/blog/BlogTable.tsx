'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { bulkBlogAction, trashBlogPost, restoreBlogPost, deleteBlogPost } from './actions'
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton'

interface BlogPost {
  id: number
  title: string
  slug: string
  visibility: string
  published_at: string | null
  created_at: string
  blog_post_categories?: Array<{ blog_categories: { id: number; name: string; slug: string } | null }>
}

interface Category {
  id: number
  name: string
  slug: string
}

interface BlogTableProps {
  posts: BlogPost[]
  isTrash: boolean
  tab: string
  categories: Category[]
}

function getStatusInfo(post: BlogPost) {
  const now = new Date()
  if (post.visibility === 'private') return { label: 'Trash', badge: 'bg-red-100 text-red-700' }
  if (post.visibility === 'draft') return { label: 'Draft', badge: 'bg-yellow-100 text-yellow-700' }
  if (post.visibility === 'publish' && post.published_at && new Date(post.published_at) > now) {
    return { label: 'Scheduled', badge: 'bg-blue-100 text-blue-700' }
  }
  if (post.visibility === 'publish') return { label: 'Published', badge: 'bg-green-100 text-green-700' }
  return { label: post.visibility, badge: 'bg-gray-100 text-gray-600' }
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      timeZone: 'America/Los_Angeles',
    })
  } catch { return '' }
}

function formatScheduleDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  const tz = 'America/Los_Angeles'
  const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  if (days > 0 && days <= 7) return `${formatted} at ${time} (in ${days}d)`
  return `${formatted} at ${time}`
}

export function BlogTable({ posts, isTrash, tab, categories }: BlogTableProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkAction, setBulkAction] = useState('')
  const [bulkCategory, setBulkCategory] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const allSelected = posts.length > 0 && posts.every(p => selected.has(p.id))

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(posts.map(p => p.id)))
    }
  }

  function toggleOne(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleBulkApply() {
    if (selected.size === 0 || !bulkAction) return

    const ids = Array.from(selected)
    let action = bulkAction
    let value: string | undefined

    if (action === 'set-category') {
      if (!bulkCategory) return
      value = bulkCategory
    } else if (action === 'remove-category') {
      if (!bulkCategory) return
      value = bulkCategory
    }

    // Confirm destructive actions
    if (action === 'trash' && !confirm(`Move ${ids.length} post(s) to trash?`)) return
    if (action === 'delete' && !confirm(`Permanently delete ${ids.length} post(s)? This cannot be undone.`)) return

    startTransition(async () => {
      await bulkBlogAction(ids, action, value)
      setSelected(new Set())
      setBulkAction('')
      setBulkCategory('')
      router.refresh()
    })
  }

  return (
    <>
      {/* Bulk Action Bar */}
      {posts.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <select
            value={bulkAction}
            onChange={e => { setBulkAction(e.target.value); setBulkCategory('') }}
            className="text-sm border border-gray-200 rounded-lg py-1.5 px-2.5 bg-gray-50 focus:bg-white focus:border-[#3ea8c8] focus:ring-1 focus:ring-[#3ea8c8]/30 outline-none"
          >
            <option value="">Bulk Actions</option>
            {isTrash ? (
              <>
                <option value="restore">Restore</option>
                <option value="delete">Delete Permanently</option>
              </>
            ) : (
              <>
                <option value="publish">Set Published</option>
                <option value="draft">Set Draft</option>
                <option value="trash">Move to Trash</option>
                <option value="set-category">Add Category</option>
                <option value="remove-category">Remove Category</option>
              </>
            )}
          </select>

          {(bulkAction === 'set-category' || bulkAction === 'remove-category') && (
            <select
              value={bulkCategory}
              onChange={e => setBulkCategory(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg py-1.5 px-2.5 bg-gray-50 focus:bg-white focus:border-[#3ea8c8] focus:ring-1 focus:ring-[#3ea8c8]/30 outline-none"
            >
              <option value="">Select Category</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          <button
            onClick={handleBulkApply}
            disabled={isPending || selected.size === 0 || !bulkAction}
            className="text-sm btn-outline py-1.5 px-3 disabled:opacity-40"
          >
            {isPending ? 'Applying...' : `Apply${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </button>

          {selected.size > 0 && (
            <span className="text-xs text-gray-400 ml-1">
              {selected.size} selected
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="admin-card p-0 overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-gray-300"
                />
              </th>
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
                <td colSpan={6} className="text-center text-gray-400 py-12">
                  {isTrash ? 'Trash is empty.' : 'No posts found.'}
                </td>
              </tr>
            ) : posts.map((p) => {
              const status = getStatusInfo(p)
              const isScheduled = status.label === 'Scheduled'
              return (
                <tr key={p.id} className={`${isTrash ? 'opacity-60' : ''} ${selected.has(p.id) ? 'bg-[#3ea8c8]/5' : ''}`}>
                  <td className="w-10">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleOne(p.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="text-gray-400 text-xs">{p.id}</td>
                  <td>
                    <Link
                      href={`/admin/blog/${p.id}/edit`}
                      className="font-medium text-gray-900 hover:text-[#3ea8c8] transition-colors"
                    >
                      {p.title || <span className="italic text-gray-400">Untitled</span>}
                    </Link>
                    {p.blog_post_categories?.map(bpc => bpc.blog_categories).filter(Boolean).map(cat => (
                      <span key={cat!.id} className="ml-1.5 inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-500">
                        {cat!.name}
                      </span>
                    ))}
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
                          <form action={restoreBlogPost.bind(null, p.id)}>
                            <button type="submit" className="text-xs btn-outline py-1 px-2 text-green-600 border-green-300 hover:bg-green-50">
                              Restore
                            </button>
                          </form>
                          <form action={deleteBlogPost.bind(null, p.id)}>
                            <ConfirmDeleteButton message="Permanently delete this post? This cannot be undone." />
                          </form>
                        </>
                      ) : (
                        <>
                          <Link href={`/admin/blog/${p.id}/edit`} className="text-xs btn-outline py-1 px-2">Edit</Link>
                          <form action={trashBlogPost.bind(null, p.id)}>
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
    </>
  )
}
