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
  ai_generated?: boolean
  verifiability_score?: number | null
  verifiability_checked_at?: string | null
}

/**
 * Render a verifiability score badge. Returns null if not an AI post.
 *  ≥85 → green   60-84 → yellow   <60 → red   not yet checked → gray "Unchecked"
 */
function ScoreBadge({ post }: { post: BlogPost }) {
  if (!post.ai_generated) return null
  if (post.verifiability_score == null) {
    return (
      <span title="AI-generated, not yet fact-checked"
        className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded bg-gray-100 text-gray-500">
        Unchecked
      </span>
    )
  }
  const s = post.verifiability_score
  const cls = s >= 85 ? 'bg-green-100 text-green-700'
    : s >= 60 ? 'bg-yellow-100 text-yellow-700'
    : 'bg-red-100 text-red-700'
  return (
    <span title={`AI verifiability: ${s}/100 — verified ${post.verifiability_checked_at ? new Date(post.verifiability_checked_at).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }) : ''}`}
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded ${cls}`}>
      {s}/100
    </span>
  )
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

interface VerifyProgress {
  processed: number
  total: number
  results: Array<{
    id: number
    title: string
    score?: number
    trashed?: boolean
    error?: string
  }>
  done: boolean
  errors: number
  trashed: number
}

export function BlogTable({ posts, isTrash, tab, categories }: BlogTableProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkAction, setBulkAction] = useState('')
  const [bulkCategory, setBulkCategory] = useState('')
  const [isPending, startTransition] = useTransition()
  const [verifyProgress, setVerifyProgress] = useState<VerifyProgress | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)
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

  async function runBulkVerify(ids: number[]) {
    setVerifyError(null)
    setVerifyProgress({ processed: 0, total: ids.length, results: [], done: false, errors: 0, trashed: 0 })

    let res: Response
    try {
      res = await fetch('/api/admin/blog/bulk-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
    } catch (e: any) {
      setVerifyError(e?.message ?? 'Network error starting verification.')
      setVerifyProgress(null)
      return
    }

    if (!res.ok) {
      let msg = `Failed (${res.status}).`
      try {
        const j = await res.json()
        if (j?.error) msg = j.error
      } catch { /* not JSON */ }
      setVerifyError(msg)
      setVerifyProgress(null)
      return
    }

    // The endpoint may return a plain JSON "nothing to verify" response or an
    // SSE stream with progress events. Detect by content-type.
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/event-stream')) {
      try {
        const j = await res.json()
        if (j?.message) setVerifyError(j.message)
      } catch { /* ignore */ }
      setVerifyProgress(null)
      return
    }

    const reader = res.body?.getReader()
    if (!reader) {
      setVerifyError('Streaming not supported in this browser.')
      setVerifyProgress(null)
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE frames are separated by blank lines. Each "data: ..." line carries
      // a single JSON event from the server.
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const line = frame.split('\n').find(l => l.startsWith('data: '))
        if (!line) continue
        try {
          const evt = JSON.parse(line.slice(6))
          setVerifyProgress(prev => {
            if (!prev) return prev
            if (evt.type === 'start') {
              return { ...prev, total: evt.total }
            }
            if (evt.type === 'progress') {
              return {
                ...prev,
                processed: evt.processed,
                total: evt.total,
                results: [...prev.results, { id: evt.id, title: evt.title, score: evt.score, trashed: evt.trashed }],
                trashed: prev.trashed + (evt.trashed ? 1 : 0),
              }
            }
            if (evt.type === 'error') {
              return {
                ...prev,
                results: [...prev.results, { id: evt.id, title: evt.title, error: evt.message }],
                errors: prev.errors + 1,
              }
            }
            if (evt.type === 'done') {
              return { ...prev, done: true }
            }
            return prev
          })
        } catch { /* skip malformed frame */ }
      }
    }

    router.refresh()
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

    // Re-verify is its own SSE-streamed flow — split it off before falling
    // through to the standard bulkBlogAction server action.
    if (action === 'reverify') {
      if (!confirm(`Re-verify ${ids.length} post(s)? This calls the AI fact-checker on each one and can take a couple minutes per post.`)) return
      runBulkVerify(ids).then(() => {
        setSelected(new Set())
        setBulkAction('')
      })
      return
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
                <option value="reverify">Re-verify Scores</option>
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

      {/* Re-verify progress panel — appears while a bulk verification is running
          and persists with the per-post results until the admin dismisses it. */}
      {(verifyProgress || verifyError) && (
        <div className="mb-4 admin-card p-4 border border-[#3ea8c8]/30 bg-[#3ea8c8]/5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <div className="text-sm font-semibold text-gray-900">
                {verifyError
                  ? 'Re-verify failed'
                  : verifyProgress?.done
                    ? `Re-verify complete: ${verifyProgress.processed}/${verifyProgress.total} processed`
                    : `Re-verifying ${verifyProgress?.processed ?? 0}/${verifyProgress?.total ?? 0}…`}
              </div>
              {verifyProgress && !verifyError && (
                <div className="text-xs text-gray-500 mt-0.5">
                  {verifyProgress.trashed > 0 && <span className="text-red-600 mr-2">{verifyProgress.trashed} trashed</span>}
                  {verifyProgress.errors > 0 && <span className="text-orange-600">{verifyProgress.errors} errors</span>}
                </div>
              )}
              {verifyError && (
                <div className="text-xs text-red-600 mt-0.5">{verifyError}</div>
              )}
            </div>
            {(verifyProgress?.done || verifyError) && (
              <button
                onClick={() => { setVerifyProgress(null); setVerifyError(null) }}
                className="text-xs text-gray-400 hover:text-gray-700"
              >
                Dismiss
              </button>
            )}
          </div>
          {verifyProgress && verifyProgress.total > 0 && (
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-[#3ea8c8] transition-all"
                style={{ width: `${Math.round((verifyProgress.processed / verifyProgress.total) * 100)}%` }}
              />
            </div>
          )}
          {verifyProgress && verifyProgress.results.length > 0 && (
            <div className="max-h-40 overflow-y-auto text-xs">
              <ul className="space-y-1">
                {verifyProgress.results.slice().reverse().map((r, i) => (
                  <li key={`${r.id}-${i}`} className="flex items-center gap-2">
                    <span className="text-gray-400 w-10 shrink-0">#{r.id}</span>
                    {r.error ? (
                      <span className="text-red-600">Error — {r.error}</span>
                    ) : (
                      <>
                        <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                          (r.score ?? 0) >= 85 ? 'bg-green-100 text-green-700'
                            : (r.score ?? 0) >= 60 ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {r.score}/100
                        </span>
                        {r.trashed && <span className="text-[10px] text-red-600 font-medium">trashed</span>}
                      </>
                    )}
                    <span className="text-gray-700 truncate">{r.title}</span>
                  </li>
                ))}
              </ul>
            </div>
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
              <th>Score</th>
              <th>{tab === 'scheduled' ? 'Publishes' : 'Date'}</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-gray-400 py-12">
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
                  <td>
                    <ScoreBadge post={p} />
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
