'use client'

import { useActionState, useState, useCallback } from 'react'
import { saveCompany } from '@/app/admin/companies/actions'
import Link from 'next/link'
import { ImageScanner } from '@/components/admin/ImageScanner'
import { AIResearchButton } from '@/components/admin/AIResearchButton'
import { LastEnrichedBadge } from '@/components/admin/LastEnrichedBadge'
import { parsePhpSerialized, formatPhone } from '@/lib/utils'

interface AIStaffResult {
  name: string
  position: string | null
  confidence: number
}

interface CompanyFormProps {
  company?: Record<string, any> | null
  onStaffFromAI?: (staff: AIStaffResult[]) => void
}

export function CompanyForm({ company, onStaffFromAI }: CompanyFormProps) {
  const [state, action, pending] = useActionState(saveCompany, null)
  const [scannedData, setScannedData] = useState<any>(null)

  const handleScan = useCallback((data: any) => {
    setScannedData(data)
  }, [])

  const handleAIResult = useCallback((data: any) => {
    // Merge AI research data with existing, only filling nulls
    setScannedData((prev: any) => ({
      ...(prev ?? {}),
      address: data.address ?? prev?.address ?? undefined,
      phone: data.phone ?? prev?.phone ?? undefined,
      fax: data.fax ?? prev?.fax ?? undefined,
      email: data.email ?? prev?.email ?? undefined,
      linkedin: data.linkedin ?? prev?.linkedin ?? undefined,
      twitter: data.twitter ?? prev?.twitter ?? undefined,
      website: data.website ?? prev?.website ?? undefined,
      content: data.description ?? prev?.content ?? undefined,
      // Track which fields AI searched but didn't find
      aiSearched: {
        email: true,
        linkedin: true,
        twitter: true,
        website: true,
        instagram: true,
        phone: true,
        fax: true,
      },
      aiNotFound: data.searched_but_not_found ?? [],
    }))

    // Pass staff to parent for creating as Key Staff records
    if (data.key_staff?.length > 0 && onStaffFromAI) {
      const staffWithConfidence = data.key_staff.map((s: any) => ({
        name: s.name,
        position: s.position ?? null,
        confidence: s.confidence ?? 0.7,
      }))
      onStaffFromAI(staffWithConfidence)
    }
  }, [onStaffFromAI])

  const v = (key: string) => {
    if (scannedData?.[key] != null) return String(scannedData[key])
    return company?.[key] ?? ''
  }

  // Parse PHP serialized data from DB arrays and take the first clean value
  const firstAddress = scannedData?.address ?? parsePhpSerialized(company?.addresses)[0] ?? ''
  const firstPhone = scannedData?.phone ?? formatPhone(parsePhpSerialized(company?.phones)[0] ?? '')
  const firstFax = scannedData?.fax ?? formatPhone(parsePhpSerialized(company?.faxes)[0] ?? '')
  const firstEmail = scannedData?.email ?? parsePhpSerialized(company?.emails)[0] ?? ''
  const linkedinVal = scannedData?.linkedin ?? company?.linkedin ?? ''
  const twitterVal = scannedData?.twitter ?? company?.twitter ?? ''
  const websiteVal = scannedData?.website ?? company?.website ?? ''

  const contentDefault = scannedData?.content ?? company?.content ?? ''
  const aiSearched = scannedData?.aiSearched ?? {}

  const currentName = v('title') || company?.title || ''

  return (
    <form action={action} className="space-y-6 max-w-2xl" key={scannedData ? JSON.stringify(scannedData).substring(0, 50) : 'default'}>
      {company && <input type="hidden" name="id" value={company.id} />}

      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* AI Tools — available in both create and edit modes */}
      <div className="admin-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            AI Tools
          </h2>
          {company && <LastEnrichedBadge lastEnrichedAt={company.last_enriched_at} />}
        </div>
        <div className="flex flex-wrap gap-3">
          <AIResearchButton
            type="company"
            name={currentName}
            recordId={company?.id ?? null}
            existingData={{
              address: firstAddress || null,
              phone: firstPhone || null,
              email: firstEmail || null,
              linkedin: linkedinVal || null,
              twitter: twitterVal || null,
            }}
            onResult={handleAIResult}
          />
          <ImageScanner type="company" onScanComplete={handleScan} />
        </div>
        <p className="text-xs text-gray-400">
          Use AI Research to auto-fill missing contact details, or scan a screenshot to extract data.
        </p>
      </div>

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
          <label className="form-label flex items-center gap-2">
            Email
            {aiSearched.email && !firstEmail && <NotFoundBadge />}
          </label>
          <input name="email" type="email" defaultValue={firstEmail} className="form-input" />
        </div>
        <div>
          <label className="form-label flex items-center gap-2">
            Website
            {aiSearched.website && !websiteVal && <NotFoundBadge />}
          </label>
          <input name="website" defaultValue={websiteVal} className="form-input" placeholder="https://…" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label flex items-center gap-2">
              LinkedIn URL
              {aiSearched.linkedin && !linkedinVal && <NotFoundBadge />}
            </label>
            <input name="linkedin" defaultValue={linkedinVal} className="form-input" placeholder="https://linkedin.com/company/…" />
          </div>
          <div>
            <label className="form-label flex items-center gap-2">
              Twitter / X Handle
              {aiSearched.twitter && !twitterVal && <NotFoundBadge />}
            </label>
            <input name="twitter" defaultValue={twitterVal} className="form-input" placeholder="@handle" />
          </div>
        </div>
      </div>

      <div className="admin-card space-y-4">
        <h2 className="font-semibold text-gray-700">About / Notes</h2>
        <textarea name="content" rows={5} defaultValue={contentDefault} className="form-textarea" />
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

function NotFoundBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded" title="AI searched but did not find this information">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      Not found
    </span>
  )
}
