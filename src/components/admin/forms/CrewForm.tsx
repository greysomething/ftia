'use client'

import { useActionState } from 'react'
import { saveCrew } from '@/app/admin/crew/actions'
import Link from 'next/link'

interface CrewFormProps {
  crew?: Record<string, any> | null
}

export function CrewForm({ crew }: CrewFormProps) {
  const [state, action, pending] = useActionState(saveCrew, null)
  const v = (key: string) => crew?.[key] ?? ''

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      {crew && <input type="hidden" name="id" value={crew.id} />}

      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="admin-card space-y-4">
        <div>
          <label className="form-label">Name *</label>
          <input name="title" required defaultValue={v('title')} className="form-input" />
        </div>
        <div>
          <label className="form-label">Slug</label>
          <input name="slug" defaultValue={v('slug')} className="form-input" placeholder="auto-generated" />
        </div>
        <div>
          <label className="form-label">Visibility</label>
          <select name="visibility" defaultValue={v('visibility') || 'public'} className="form-input">
            <option value="public">Public</option>
            <option value="members_only">Members Only</option>
            <option value="private">Private (Draft)</option>
          </select>
        </div>
        <div>
          <label className="form-label">Email</label>
          <input name="email" type="email" defaultValue={v('email')} className="form-input" />
        </div>
        <div>
          <label className="form-label">Phone</label>
          <input name="phone" defaultValue={v('phone')} className="form-input" />
        </div>
        <div>
          <label className="form-label">LinkedIn URL</label>
          <input name="linkedin" defaultValue={v('linkedin')} className="form-input" placeholder="https://linkedin.com/in/…" />
        </div>
        <div>
          <label className="form-label">Notes</label>
          <textarea name="content" rows={5} defaultValue={v('content')} className="form-textarea" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Saving…' : crew ? 'Update Crew' : 'Create Crew'}
        </button>
        <Link href="/admin/crew" className="btn-outline">Cancel</Link>
      </div>
    </form>
  )
}
