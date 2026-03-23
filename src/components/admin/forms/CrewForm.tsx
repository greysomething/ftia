'use client'

import { useActionState, useState, useCallback } from 'react'
import { saveCrew } from '@/app/admin/crew/actions'
import Link from 'next/link'
import { ImageScanner } from '@/components/admin/ImageScanner'
import { parsePhpSerialized, formatPhone } from '@/lib/utils'

interface CrewFormProps {
  crew?: Record<string, any> | null
}

export function CrewForm({ crew }: CrewFormProps) {
  const [state, action, pending] = useActionState(saveCrew, null)
  const [scannedData, setScannedData] = useState<any>(null)

  const handleScan = useCallback((data: any) => {
    setScannedData(data)
  }, [])

  const v = (key: string) => {
    if (scannedData?.[key] != null) return String(scannedData[key])
    return crew?.[key] ?? ''
  }

  const firstEmail = scannedData?.email ?? parsePhpSerialized(crew?.emails)[0] ?? ''
  const firstPhone = scannedData?.phone ?? formatPhone(parsePhpSerialized(crew?.phones)[0] ?? '')

  return (
    <form action={action} className="space-y-6 max-w-2xl" key={scannedData ? 'scanned' : 'default'}>
      {crew && <input type="hidden" name="id" value={crew.id} />}

      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {state.error}
        </div>
      )}

      {!crew && (
        <ImageScanner type="crew" onScanComplete={handleScan} />
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

        {scannedData?.roles?.length > 0 && (
          <div className="p-3 bg-[#3ea8c8]/5 border border-[#3ea8c8]/20 rounded-lg">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">AI Detected Roles</p>
            <div className="flex flex-wrap gap-1">
              {scannedData.roles.map((role: string, i: number) => (
                <span key={i} className="text-xs bg-[#3ea8c8]/10 text-[#3ea8c8] px-2 py-0.5 rounded-full">{role}</span>
              ))}
            </div>
          </div>
        )}

        {scannedData?.bio && (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">AI Extracted Bio</p>
            <p className="text-sm text-gray-600">{scannedData.bio}</p>
          </div>
        )}
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
