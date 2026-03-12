'use client'

import { useActionState } from 'react'
import { saveCompany } from '@/app/admin/companies/actions'
import Link from 'next/link'

interface CompanyFormProps {
  company?: Record<string, any> | null
}

export function CompanyForm({ company }: CompanyFormProps) {
  const [state, action, pending] = useActionState(saveCompany, null)

  const v = (key: string) => company?.[key] ?? ''

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      {company && <input type="hidden" name="id" value={company.id} />}

      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="admin-card space-y-4">
        <h2 className="font-semibold text-gray-700">Basic Info</h2>
        <div>
          <label className="form-label">Company Name *</label>
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
      </div>

      <div className="admin-card space-y-4">
        <h2 className="font-semibold text-gray-700">Contact Details</h2>
        <div>
          <label className="form-label">Address</label>
          <input name="address" defaultValue={v('address')} className="form-input" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">City</label>
            <input name="city" defaultValue={v('city')} className="form-input" />
          </div>
          <div>
            <label className="form-label">Province / State</label>
            <input name="province" defaultValue={v('province')} className="form-input" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Phone</label>
            <input name="phone" defaultValue={v('phone')} className="form-input" />
          </div>
          <div>
            <label className="form-label">Fax</label>
            <input name="fax" defaultValue={v('fax')} className="form-input" />
          </div>
        </div>
        <div>
          <label className="form-label">Email</label>
          <input name="email" type="email" defaultValue={v('email')} className="form-input" />
        </div>
        <div>
          <label className="form-label">Website</label>
          <input name="website" type="url" defaultValue={v('website')} className="form-input" placeholder="https://" />
        </div>
        <div>
          <label className="form-label">LinkedIn URL</label>
          <input name="linkedin" defaultValue={v('linkedin')} className="form-input" placeholder="https://linkedin.com/company/…" />
        </div>
        <div>
          <label className="form-label">Twitter / X Handle</label>
          <input name="twitter" defaultValue={v('twitter')} className="form-input" placeholder="@handle" />
        </div>
      </div>

      <div className="admin-card space-y-4">
        <h2 className="font-semibold text-gray-700">Notes</h2>
        <textarea name="content" rows={5} defaultValue={v('content')} className="form-textarea" />
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Saving…' : company ? 'Update Company' : 'Create Company'}
        </button>
        <Link href="/admin/companies" className="btn-outline">Cancel</Link>
      </div>
    </form>
  )
}
