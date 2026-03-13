'use client'

import { useActionState } from 'react'
import { saveProduction } from '@/app/admin/productions/actions'
import Link from 'next/link'

interface ProductionFormProps {
  production?: {
    id: number
    title: string
    slug: string
    visibility: string
    content: string | null
    production_date_start: string | null
    production_date_end: string | null
  } | null
}

const VISIBILITY_OPTIONS = [
  { value: 'publish', label: 'Published' },
  { value: 'members_only', label: 'Members Only' },
  { value: 'private', label: 'Private (Draft)' },
]

export function ProductionForm({ production }: ProductionFormProps) {
  const [state, action, pending] = useActionState(saveProduction, null)

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      {production && <input type="hidden" name="id" value={production.id} />}

      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="admin-card space-y-4">
        <div>
          <label className="form-label">Title *</label>
          <input
            name="title"
            required
            defaultValue={production?.title ?? ''}
            className="form-input"
            placeholder="Production title"
          />
        </div>

        <div>
          <label className="form-label">Slug</label>
          <input
            name="slug"
            defaultValue={production?.slug ?? ''}
            className="form-input"
            placeholder="auto-generated-from-title"
          />
          <p className="text-xs text-gray-400 mt-1">Leave blank to auto-generate from title.</p>
        </div>

        <div>
          <label className="form-label">Visibility</label>
          <select name="visibility" defaultValue={production?.visibility ?? 'publish'} className="form-input">
            {VISIBILITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Shoot Start Date</label>
            <input
              name="production_date_start"
              type="date"
              defaultValue={production?.production_date_start?.slice(0, 10) ?? ''}
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">Shoot End Date</label>
            <input
              name="production_date_end"
              type="date"
              defaultValue={production?.production_date_end?.slice(0, 10) ?? ''}
              className="form-input"
            />
          </div>
        </div>

        <div>
          <label className="form-label">Notes / Content</label>
          <textarea
            name="content"
            rows={8}
            defaultValue={production?.content ?? ''}
            className="form-textarea"
            placeholder="Optional notes or HTML content"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Saving…' : production ? 'Update Production' : 'Create Production'}
        </button>
        <Link href="/admin/productions" className="btn-outline">
          Cancel
        </Link>
      </div>
    </form>
  )
}
