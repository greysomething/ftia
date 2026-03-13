'use client'

import { useActionState } from 'react'
import { saveDnwNotice } from '@/app/admin/dnw-notices/actions'
import Link from 'next/link'

interface DnwNoticeFormProps {
  notice?: Record<string, any> | null
}

export function DnwNoticeForm({ notice }: DnwNoticeFormProps) {
  const [state, action, pending] = useActionState(saveDnwNotice, null)
  const v = (key: string) => notice?.[key] ?? ''
  const today = new Date().toISOString().slice(0, 10)

  return (
    <form action={action} className="space-y-6 max-w-3xl">
      {notice && <input type="hidden" name="id" value={notice.id} />}

      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="admin-card space-y-4">
        <div>
          <label className="form-label">Production Title *</label>
          <input
            name="production_title"
            required
            defaultValue={v('production_title')}
            className="form-input"
            placeholder="e.g. Untitled Action Feature"
          />
        </div>

        <div>
          <label className="form-label">Company / Producer Name *</label>
          <input
            name="company_name"
            required
            defaultValue={v('company_name')}
            className="form-input"
            placeholder="e.g. ABC Productions, Inc."
          />
        </div>

        <div>
          <label className="form-label">Reason</label>
          <textarea
            name="reason"
            rows={3}
            defaultValue={v('reason')}
            className="form-textarea"
            placeholder="e.g. No SAG-AFTRA contract on file for this production"
          />
        </div>

        <div>
          <label className="form-label">Additional Details</label>
          <textarea
            name="details"
            rows={4}
            defaultValue={v('details')}
            className="form-textarea"
            placeholder="Any additional information about this notice"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Notice Date</label>
            <input
              type="date"
              name="notice_date"
              defaultValue={v('notice_date') ? String(v('notice_date')).slice(0, 10) : today}
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">Status</label>
            <select
              name="status"
              defaultValue={v('status') || 'active'}
              className="form-input"
            >
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Saving…' : notice ? 'Update Notice' : 'Create Notice'}
        </button>
        <Link href="/admin/dnw-notices" className="btn-outline">Cancel</Link>
      </div>
    </form>
  )
}
