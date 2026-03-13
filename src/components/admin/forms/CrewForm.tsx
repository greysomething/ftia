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

  // crew_members uses arrays for emails/phones; show the first entry in the form
  const firstEmail = Array.isArray(crew?.emails) ? crew.emails[0] ?? '' : ''
  const firstPhone = Array.isArray(crew?.phones) ? crew.phones[0] ?? '' : ''

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
          <input name="name" required defaultValue={v('name')} className="form-input" />
        </div>
        <div>
          <label className="form-label">Slug</label>
          <input name="slug" defaultValue={v('slug')} className="form-input" placeholder="auto-generated" />
        </div>
        <div>
          <label className="form-label">Visibility</label>
          <select name="visibility" defaultValue={v('visibility') || 'publish'} className="form-input">
            <option value="publish">Published</option>
            <option value="members_only">Members Only</option>
            <option value="private">Private (Draft)</option>
          </select>
        </div>
        <div>
          <label className="form-label">Email</label>
          <input name="email" type="email" defaultValue={firstEmail} className="form-input" />
        </div>
        <div>
          <label className="form-label">Phone</label>
          <input name="phone" defaultValue={firstPhone} className="form-input" />
        </div>
        <div>
          <label className="form-label">LinkedIn URL</label>
          <input name="linkedin" defaultValue={v('linkedin')} className="form-input" placeholder="https://linkedin.com/in/…" />
        </div>
        <div>
          <label className="form-label">Twitter / X Handle</label>
          <input name="twitter" defaultValue={v('twitter')} className="form-input" placeholder="@handle" />
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
