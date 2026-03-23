'use client'

import { useActionState, useState, useCallback } from 'react'
import { saveCompany } from '@/app/admin/companies/actions'
import Link from 'next/link'
import { ImageScanner } from '@/components/admin/ImageScanner'

interface CompanyFormProps {
  company?: Record<string, any> | null
}

export function CompanyForm({ company }: CompanyFormProps) {
  const [state, action, pending] = useActionState(saveCompany, null)
  const [scannedData, setScannedData] = useState<any>(null)

  const handleScan = useCallback((data: any) => {
    setScannedData(data)
  }, [])

  const v = (key: string) => {
    if (scannedData?.[key] != null) return String(scannedData[key])
    return company?.[key] ?? ''
  }

  const firstAddress = scannedData?.address ?? (Array.isArray(company?.addresses) ? company.addresses[0] ?? '' : '')
  const firstPhone = scannedData?.phone ?? (Array.isArray(company?.phones) ? company.phones[0] ?? '' : '')
  const firstFax = scannedData?.fax ?? (Array.isArray(company?.faxes) ? company.faxes[0] ?? '' : '')
  const firstEmail = scannedData?.email ?? (Array.isArray(company?.emails) ? company.emails[0] ?? '' : '')

  const contentDefault = (() => {
    if (scannedData?.staff?.length) {
      const staffLines = scannedData.staff.map((s: any) => `${s.name} — ${s.position ?? 'Staff'}`).join('\n')
      const base = scannedData?.content ?? company?.content ?? ''
      return base ? `${base}\n\n--- STAFF ---\n${staffLines}` : `--- STAFF ---\n${staffLines}`
    }
    return scannedData?.content ?? company?.content ?? ''
  })()

  return (
    <form action={action} className="space-y-6 max-w-2xl" key={scannedData ? 'scanned' : 'default'}>
      {company && <input type="hidden" name="id" value={company.id} />}

      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {state.error}
        </div>
      )}

      {!company && (
        <ImageScanner type="company" onScanComplete={handleScan} />
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
          <select name="visibility" defaultValue={v('visibility') || 'publish'} className="form-input">
            <option value="publish">Published</option>
            <option value="members_only">Members Only</option>
            <option value="private">Private (Draft)</option>
          </select>
        </div>
      </div>

      <div className="admin-card space-y-4">
        <h2 className="font-semibold text-gray-700">Contact Details</h2>
        <div>
          <label className="form-label">Address</label>
          <input name="address" defaultValue={firstAddress} className="form-input" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Phone</label>
            <input name="phone" defaultValue={firstPhone} className="form-input" />
          </div>
          <div>
            <label className="form-label">Fax</label>
            <input name="fax" defaultValue={firstFax} className="form-input" />
          </div>
        </div>
        <div>
          <label className="form-label">Email</label>
          <input name="email" type="email" defaultValue={firstEmail} className="form-input" />
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
        <textarea name="content" rows={5} defaultValue={contentDefault} className="form-textarea" />
        {scannedData?.staff?.length > 0 && (
          <p className="text-xs text-[#3ea8c8]">
            ↑ AI extracted {scannedData.staff.length} staff member(s) from your screenshot
          </p>
        )}
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
