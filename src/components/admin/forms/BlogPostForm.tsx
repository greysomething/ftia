'use client'

import { useActionState, useState, useRef } from 'react'
import { saveBlogPost } from '@/app/admin/blog/actions'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const RichTextEditor = dynamic(
  () => import('@/components/admin/RichTextEditor').then((m) => m.RichTextEditor),
  { ssr: false, loading: () => <div className="border border-gray-300 rounded-lg bg-gray-50 h-[460px] animate-pulse" /> }
)

interface BlogPostFormProps {
  post?: Record<string, any> | null
}

export function BlogPostForm({ post }: BlogPostFormProps) {
  const [state, action, pending] = useActionState(saveBlogPost, null)
  const [content, setContent] = useState(post?.content ?? '')
  const [featuredImage, setFeaturedImage] = useState(post?.featured_image_url ?? '')
  const [uploading, setUploading] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const v = (key: string) => post?.[key] ?? ''

  // Determine if post is currently scheduled
  const isScheduled = post?.visibility === 'publish' && post?.published_at && new Date(post.published_at) > new Date()
  const [visibility, setVisibility] = useState<string>(isScheduled ? 'schedule' : (v('visibility') || 'draft'))
  const [scheduleDate, setScheduleDate] = useState<string>(() => {
    if (isScheduled && post?.published_at) {
      const d = new Date(post.published_at)
      return d.toISOString().slice(0, 16) // YYYY-MM-DDTHH:MM
    }
    return ''
  })

  async function handleFeaturedImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/admin/upload-image', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.url) setFeaturedImage(data.url)
    } catch {
      // silently fail
    }
    setUploading(false)
  }

  return (
    <form ref={formRef} action={action} className="space-y-6 max-w-4xl">
      {post && <input type="hidden" name="id" value={post.id} />}
      <input type="hidden" name="content" value={content} />

      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          <div className="admin-card space-y-4">
            <div>
              <label className="form-label">Title *</label>
              <input name="title" required defaultValue={v('title')} className="form-input text-lg font-semibold" />
            </div>
            <div>
              <label className="form-label">Slug</label>
              <input name="slug" defaultValue={v('slug')} className="form-input font-mono text-sm" placeholder="auto-generated from title" />
            </div>
          </div>

          <div className="admin-card">
            <label className="form-label mb-2 block">Content</label>
            <RichTextEditor content={content} onChange={setContent} />
          </div>

          <div className="admin-card">
            <label className="form-label">Excerpt</label>
            <textarea name="excerpt" rows={3} defaultValue={v('excerpt')} className="form-textarea"
              placeholder="Short summary shown on listing pages and SEO descriptions" />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Publish settings */}
          <div className="admin-card space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Publish</h3>
            {/* Actual visibility sent to server */}
            <input type="hidden" name="visibility" value={visibility === 'schedule' ? 'publish' : visibility} />
            {visibility === 'schedule' && scheduleDate && (
              <input type="hidden" name="scheduled_at" value={scheduleDate} />
            )}
            <div>
              <label className="form-label">Status</label>
              <select
                value={visibility}
                onChange={e => {
                  setVisibility(e.target.value)
                  if (e.target.value === 'schedule' && !scheduleDate) {
                    // Default to tomorrow at 9am
                    const tomorrow = new Date()
                    tomorrow.setDate(tomorrow.getDate() + 1)
                    tomorrow.setHours(9, 0, 0, 0)
                    setScheduleDate(tomorrow.toISOString().slice(0, 16))
                  }
                }}
                className="form-input"
              >
                <option value="draft">Draft</option>
                <option value="publish">Published</option>
                <option value="schedule">Scheduled</option>
              </select>
            </div>

            {visibility === 'schedule' && (
              <div>
                <label className="form-label">Publish Date & Time</label>
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="form-input text-sm"
                  required
                />
                {scheduleDate && (
                  <p className="text-[11px] text-blue-600 mt-1">
                    Will be published on {new Date(scheduleDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at {new Date(scheduleDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                )}
              </div>
            )}

            {isScheduled && visibility !== 'schedule' && visibility !== 'draft' && (
              <p className="text-[11px] text-amber-600">
                This will publish the post immediately instead of at the scheduled time.
              </p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={pending} className="btn-primary flex-1">
                {pending ? 'Saving...'
                  : visibility === 'schedule' ? 'Schedule'
                  : post ? 'Update Post' : 'Create Post'}
              </button>
              <Link href="/admin/blog" className="btn-outline text-center">Cancel</Link>
            </div>
          </div>

          {/* Featured Image */}
          <div className="admin-card space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Featured Image</h3>
            {featuredImage ? (
              <div className="relative">
                <img src={featuredImage} alt="Featured" className="w-full rounded-lg border border-gray-200" />
                <button
                  type="button"
                  onClick={() => setFeaturedImage('')}
                  className="absolute top-2 right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-700"
                >
                  &times;
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
                <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-xs text-gray-400 mb-2">No featured image</p>
                <label className="btn-outline text-xs cursor-pointer inline-block">
                  {uploading ? 'Uploading...' : 'Upload Image'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFeaturedImageUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>
            )}
          </div>

          {/* View on site */}
          {post?.slug && (
            <div className="admin-card">
              <Link
                href={`/${post.slug}`}
                target="_blank"
                className="flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-primary py-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View on Site
              </Link>
            </div>
          )}
        </div>
      </div>
    </form>
  )
}
