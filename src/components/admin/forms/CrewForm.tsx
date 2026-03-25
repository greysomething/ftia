'use client'

import { useActionState, useState, useCallback } from 'react'
import { saveCrew } from '@/app/admin/crew/actions'
import Link from 'next/link'
import { ImageScanner } from '@/components/admin/ImageScanner'
import { AIResearchButton } from '@/components/admin/AIResearchButton'
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

  const handleAIResult = useCallback((data: any) => {
    setScannedData((prev: any) => ({
      ...(prev ?? {}),
      email: data.email ?? prev?.email ?? undefined,
      phone: data.phone ?? prev?.phone ?? undefined,
      linkedin: data.linkedin ?? prev?.linkedin ?? undefined,
      twitter: data.twitter ?? prev?.twitter ?? undefined,
      website: data.website ?? prev?.website ?? undefined,
      bio: data.bio ?? prev?.bio ?? undefined,
      roles: data.additional_roles?.length
        ? [data.primary_role, ...data.additional_roles].filter(Boolean)
        : data.primary_role ? [data.primary_role] : prev?.roles ?? undefined,
      companies: data.companies ?? prev?.companies ?? undefined,
      known_for: data.known_for ?? prev?.known_for ?? undefined,
      imdb: data.imdb ?? prev?.imdb ?? undefined,
      representation: data.representation ?? prev?.representation ?? undefined,
    }))
  }, [])

  const v = (key: string) => {
    if (scannedData?.[key] != null) return String(scannedData[key])
    return crew?.[key] ?? ''
  }

  const firstEmail = scannedData?.email ?? parsePhpSerialized(crew?.emails)[0] ?? ''
  const firstPhone = scannedData?.phone ?? formatPhone(parsePhpSerialized(crew?.phones)[0] ?? '')
  const linkedinVal = scannedData?.linkedin ?? crew?.linkedin ?? ''
  const twitterVal = scannedData?.twitter ?? crew?.twitter ?? ''
  const websiteVal = scannedData?.website ?? crew?.website ?? ''

  const currentName = v('name') || crew?.name || ''

  const hasRepresentation = scannedData?.representation && (
    scannedData.representation.agency || scannedData.representation.agent || scannedData.representation.manager
  )

  return (
    <form action={action} className="space-y-6 max-w-2xl" key={scannedData ? JSON.stringify(scannedData).substring(0, 50) : 'default'}>
      {crew && <input type="hidden" name="id" value={crew.id} />}

      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* AI Tools */}
      <div className="admin-card space-y-3">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          AI Tools
        </h2>
        <div className="flex flex-wrap gap-3">
          <AIResearchButton
            type="crew"
            name={currentName}
            existingData={{
              email: firstEmail || null,
              phone: firstPhone || null,
              linkedin: linkedinVal || null,
              twitter: twitterVal || null,
            }}
            onResult={handleAIResult}
          />
          <ImageScanner type="crew" onScanComplete={handleScan} />
        </div>
        <p className="text-xs text-gray-400">
          Use AI Research to find contact info, credits, and bio — or scan a screenshot.
        </p>
      </div>

      <div className="admin-card space-y-4">
        <h2 className="font-semibold text-gray-700">Basic Info</h2>
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
      </div>

      <div className="admin-card space-y-4">
        <h2 className="font-semibold text-gray-700">Contact & Social</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Email</label>
            <input name="email" type="email" defaultValue={firstEmail} className="form-input" />
          </div>
          <div>
            <label className="form-label">Phone</label>
            <input name="phone" defaultValue={firstPhone} className="form-input" />
          </div>
        </div>
        <div>
          <label className="form-label">Website</label>
          <input name="website" defaultValue={websiteVal} className="form-input" placeholder="https://…" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">LinkedIn URL</label>
            <input name="linkedin" defaultValue={linkedinVal} className="form-input" placeholder="https://linkedin.com/in/…" />
          </div>
          <div>
            <label className="form-label">Twitter / X Handle</label>
            <input name="twitter" defaultValue={twitterVal} className="form-input" placeholder="@handle" />
          </div>
        </div>
      </div>

      {/* Bio / About */}
      <div className="admin-card space-y-4">
        <h2 className="font-semibold text-gray-700">Bio / About</h2>
        <textarea name="content" rows={4} defaultValue={scannedData?.bio ?? crew?.content ?? ''} className="form-textarea"
          placeholder="Brief professional biography..." />
      </div>

      {/* AI-discovered data */}
      {(scannedData?.roles?.length > 0 || scannedData?.known_for?.length > 0 || hasRepresentation || scannedData?.imdb) && (
        <div className="admin-card space-y-3">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            AI Research Results
          </h2>

          {scannedData?.roles?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Industry Roles</p>
              <div className="flex flex-wrap gap-1">
                {scannedData.roles.map((role: string, i: number) => (
                  <span key={i} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{role}</span>
                ))}
              </div>
            </div>
          )}

          {scannedData?.known_for?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Known For</p>
              <div className="flex flex-wrap gap-1">
                {scannedData.known_for.map((title: string, i: number) => (
                  <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{title}</span>
                ))}
              </div>
            </div>
          )}

          {hasRepresentation && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Representation</p>
              <div className="text-sm text-gray-600 space-y-0.5">
                {scannedData.representation.agency && <div>Agency: <strong>{scannedData.representation.agency}</strong></div>}
                {scannedData.representation.agent && <div>Agent: {scannedData.representation.agent}</div>}
                {scannedData.representation.manager && <div>Manager: {scannedData.representation.manager}</div>}
              </div>
            </div>
          )}

          {scannedData?.imdb && (
            <div>
              <a href={scannedData.imdb} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-600 hover:underline font-medium">
                View on IMDb →
              </a>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Saving…' : crew ? 'Update Person' : 'Create Person'}
        </button>
        <Link href="/admin/crew" className="btn-outline">Cancel</Link>
      </div>
    </form>
  )
}
