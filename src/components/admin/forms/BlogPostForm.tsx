'use client'

import { useActionState } from 'react'
import { saveBlogPost } from '@/app/admin/blog/actions'
import Link from 'next/link'

interface BlogPostFormProps {
  post?: Record<string, any> | null
}

export function BlogPostForm({ post }: BlogPostFormProps) {
  const [state, action, pending] = useActionState(saveBlogPost, null)
  const v = (key: string) => post?.[key] ?? ''

  return (
    <form action={action} className="space-y-6 max-w-3xl">
      {post && <input type="hidden" name="id" value={post.id} />}

      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="admin-card space-y-4">
        <div>
          <label className="form-label">Title *</label>
          <input name="title" required defaultValue={v('title')} className="form-input" />
        </div>
        <div>
          <label className="form-label">Slug</label>
          <input name="slug" defaultValue={v('slug')} className="form-input" placeholder="auto-generated" />
        </div>
        <div>
          <label className="form-label">Status</label>
          <select name="status" defaultValue={v('status') || 'draft'} className="form-input">
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </div>
        <div>
          <label className="form-label">Excerpt</label>
          <textarea name="excerpt" rows={3} defaultValue={v('excerpt')} className="form-textarea"
            placeholder="Short summary shown on listing pages" />
        </div>
        <div>
          <label className="form-label">Content</label>
          <textarea name="content" rows={16} defaultValue={v('content')} className="form-textarea"
            placeholder="HTML content" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Saving…' : post ? 'Update Post' : 'Create Post'}
        </button>
        <Link href="/admin/blog" className="btn-outline">Cancel</Link>
      </div>
    </form>
  )
}
