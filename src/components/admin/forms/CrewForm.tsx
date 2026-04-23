'use client'

import { useActionState, useState, useCallback, useRef } from 'react'
import { saveCrew } from '@/app/admin/crew/actions'
import Link from 'next/link'
import { ImageScanner } from '@/components/admin/ImageScanner'
import { AIResearchButton } from '@/components/admin/AIResearchButton'
import { LastEnrichedBadge } from '@/components/admin/LastEnrichedBadge'
import { parsePhpSerialized, formatPhone } from '@/lib/utils'
import { ProfilePhotoField } from '@/components/admin/ProfilePhotoField'
import { getCrewProfileImageUrl } from '@/lib/crew-avatar'

interface CrewFormProps {
  crew?: Record<string, any> | null
}

export function CrewForm({ crew }: CrewFormProps) {
  const [state, action, pending] = useActionState(saveCrew, null)
  const [scannedData, setScannedData] = useState<any>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Editable tag arrays
  const [roles, setRoles] = useState<string[]>(crew?.roles ?? [])
  const [knownFor, setKnownFor] = useState<string[]>(crew?.known_for ?? [])
  const [newRole, setNewRole] = useState('')
  const [newKnownFor, setNewKnownFor] = useState('')

  // AI results (separate from form state so we can show insert buttons)
  const [aiResult, setAiResult] = useState<any>(null)

  const handleScan = useCallback((data: any) => {
    setScannedData(data)
  }, [])

  const handleAIResult = useCallback((data: any) => {
    // Store the raw AI result for the insert-button UI
    setAiResult(data)

    // Auto-fill contact fields that are currently empty
    setScannedData((prev: any) => ({
      ...(prev ?? {}),
      email: data.email ?? prev?.email ?? undefined,
      phone: data.phone ?? prev?.phone ?? undefined,
      linkedin: data.linkedin ?? prev?.linkedin ?? undefined,
      twitter: data.twitter ?? prev?.twitter ?? undefined,
      instagram: data.instagram ?? prev?.instagram ?? undefined,
      website: data.website ?? prev?.website ?? undefined,
      imdb: data.imdb ?? prev?.imdb ?? undefined,
      bio: data.bio ?? prev?.bio ?? undefined,
      location: data.location ?? prev?.location ?? undefined,
      representation: data.representation ?? prev?.representation ?? undefined,
    }))
  }, [])

  // Helper: get field value with scannedData priority
  const v = (key: string) => {
    if (scannedData?.[key] != null) return String(scannedData[key])
    return crew?.[key] ?? ''
  }

  const firstEmail = scannedData?.email ?? parsePhpSerialized(crew?.emails)[0] ?? ''
  const firstPhone = scannedData?.phone ?? formatPhone(parsePhpSerialized(crew?.phones)[0] ?? '')
  const linkedinVal = scannedData?.linkedin ?? crew?.linkedin ?? ''
  const twitterVal = scannedData?.twitter ?? crew?.twitter ?? ''
  const instagramVal = scannedData?.instagram ?? crew?.instagram ?? ''
  const websiteVal = scannedData?.website ?? crew?.website ?? ''
  const imdbVal = scannedData?.imdb ?? crew?.imdb ?? ''
  const locationVal = scannedData?.location ?? crew?.location ?? ''
  const bioVal = scannedData?.bio ?? crew?.content ?? ''

  const currentName = v('name') || crew?.name || ''

  // Representation
  const rep = scannedData?.representation ?? crew?.representation ?? {}
  const hasRepresentation = rep && (rep.agency || rep.agent || rep.manager)

  // Insert helpers — update form fields from AI data
  const setFieldValue = (name: string, value: string) => {
    const el = formRef.current?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null
    if (el) {
      // Update the DOM value directly and dispatch event
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
        'value'
      )?.set
      nativeInputValueSetter?.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      // Flash highlight
      el.classList.add('ring-2', 'ring-purple-400')
      setTimeout(() => el.classList.remove('ring-2', 'ring-purple-400'), 1500)
    }
  }

  const insertRoles = () => {
    if (!aiResult) return
    const aiRoles = aiResult.additional_roles?.length
      ? [aiResult.primary_role, ...aiResult.additional_roles].filter(Boolean)
      : aiResult.primary_role ? [aiResult.primary_role] : []
    if (aiRoles.length) {
      setRoles(prev => {
        const existing = new Set(prev.map((r: string) => r.toLowerCase()))
        const newRoles = aiRoles.filter((r: string) => !existing.has(r.toLowerCase()))
        return [...prev, ...newRoles]
      })
    }
  }

  const insertKnownFor = () => {
    if (!aiResult?.known_for?.length) return
    setKnownFor(prev => {
      const existing = new Set(prev.map((k: string) => k.toLowerCase()))
      const newItems = aiResult.known_for.filter((k: string) => !existing.has(k.toLowerCase()))
      return [...prev, ...newItems]
    })
  }

  const insertRepresentation = () => {
    if (!aiResult?.representation) return
    const r = aiResult.representation
    setFieldValue('rep_agency', r.agency ?? '')
    setFieldValue('rep_agent', r.agent ?? '')
    setFieldValue('rep_manager', r.manager ?? '')
  }

  const insertAllAI = () => {
    if (!aiResult) return
    // Contact fields
    if (aiResult.email) setFieldValue('email', aiResult.email)
    if (aiResult.phone) setFieldValue('phone', aiResult.phone)
    if (aiResult.website) setFieldValue('website', aiResult.website)
    if (aiResult.linkedin) setFieldValue('linkedin', aiResult.linkedin)
    if (aiResult.twitter) setFieldValue('twitter', aiResult.twitter)
    if (aiResult.instagram) setFieldValue('instagram', aiResult.instagram)
    if (aiResult.imdb) setFieldValue('imdb', aiResult.imdb)
    if (aiResult.bio) setFieldValue('content', aiResult.bio)
    if (aiResult.location) setFieldValue('location', aiResult.location)
    insertRoles()
    insertKnownFor()
    insertRepresentation()
  }

  // Tag management
  const addRole = (role: string) => {
    const trimmed = role.trim()
    if (trimmed && !roles.some(r => r.toLowerCase() === trimmed.toLowerCase())) {
      setRoles([...roles, trimmed])
    }
    setNewRole('')
  }

  const removeRole = (idx: number) => setRoles(roles.filter((_, i) => i !== idx))

  const addKnownForItem = (item: string) => {
    const trimmed = item.trim()
    if (trimmed && !knownFor.some(k => k.toLowerCase() === trimmed.toLowerCase())) {
      setKnownFor([...knownFor, trimmed])
    }
    setNewKnownFor('')
  }

  const removeKnownFor = (idx: number) => setKnownFor(knownFor.filter((_, i) => i !== idx))

  // Check which AI fields have data we haven't used yet
  const aiHasRoles = aiResult && (aiResult.primary_role || aiResult.additional_roles?.length > 0)
  const aiHasKnownFor = aiResult?.known_for?.length > 0
  const aiHasRep = aiResult?.representation && (aiResult.representation.agency || aiResult.representation.agent || aiResult.representation.manager)

  return (
    <div className="flex gap-6 items-start">
    <form ref={formRef} action={action} className="space-y-6 max-w-2xl flex-1 min-w-0" key={scannedData ? JSON.stringify(scannedData).substring(0, 50) : 'default'}>
      {crew && <input type="hidden" name="id" value={crew.id} />}
      {/* Hidden fields for arrays */}
      <input type="hidden" name="roles" value={JSON.stringify(roles)} />
      <input type="hidden" name="known_for" value={JSON.stringify(knownFor)} />

      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* AI Tools */}
      <div className="admin-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            AI Tools
          </h2>
          {crew && <LastEnrichedBadge lastEnrichedAt={crew.last_enriched_at} />}
        </div>
        <div className="flex flex-wrap gap-3">
          <AIResearchButton
            type="crew"
            name={currentName}
            recordId={crew?.id ?? null}
            existingData={{
              email: firstEmail || null,
              phone: firstPhone || null,
              linkedin: linkedinVal || null,
              twitter: twitterVal || null,
              website: websiteVal || null,
            }}
            onResult={handleAIResult}
          />
          <ImageScanner type="crew" onScanComplete={handleScan} />
        </div>
        <p className="text-xs text-gray-400">
          AI Research searches for contact info, LinkedIn, website, IMDb, bio, credits, and representation.
        </p>
      </div>

      {/* AI Research Results — with one-click insert buttons */}
      {aiResult && (
        <div className="admin-card space-y-3 border-purple-200 bg-purple-50/50">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-purple-800 flex items-center gap-2">
              <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI Research Results
            </h2>
            <button type="button" onClick={insertAllAI}
              className="text-xs font-medium bg-purple-600 text-white px-3 py-1.5 rounded-md hover:bg-purple-700 transition-colors">
              Insert All ↓
            </button>
          </div>

          {/* Contact fields found */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            {aiResult.email && <AIField label="Email" value={aiResult.email} onInsert={() => setFieldValue('email', aiResult.email)} confidence={aiResult.field_metadata?.email?.confidence} />}
            {aiResult.phone && <AIField label="Phone" value={aiResult.phone} onInsert={() => setFieldValue('phone', aiResult.phone)} confidence={aiResult.field_metadata?.phone?.confidence} />}
            {aiResult.website && <AIField label="Website" value={aiResult.website} onInsert={() => setFieldValue('website', aiResult.website)} confidence={aiResult.field_metadata?.website?.confidence} />}
            {aiResult.linkedin && <AIField label="LinkedIn" value={aiResult.linkedin} onInsert={() => setFieldValue('linkedin', aiResult.linkedin)} confidence={aiResult.field_metadata?.linkedin?.confidence} />}
            {aiResult.twitter && <AIField label="Twitter" value={aiResult.twitter} onInsert={() => setFieldValue('twitter', aiResult.twitter)} confidence={aiResult.field_metadata?.twitter?.confidence} />}
            {aiResult.instagram && <AIField label="Instagram" value={aiResult.instagram} onInsert={() => setFieldValue('instagram', aiResult.instagram)} confidence={aiResult.field_metadata?.instagram?.confidence} />}
            {aiResult.imdb && <AIField label="IMDb" value={aiResult.imdb} onInsert={() => setFieldValue('imdb', aiResult.imdb)} confidence={aiResult.field_metadata?.imdb?.confidence} />}
            {aiResult.location && <AIField label="Location" value={aiResult.location} onInsert={() => setFieldValue('location', aiResult.location)} confidence={aiResult.field_metadata?.location?.confidence} />}
          </div>

          {aiResult.bio && (
            <div className="text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Bio</span>
                <InsertButton onClick={() => setFieldValue('content', aiResult.bio)} />
              </div>
              <p className="text-gray-700 text-xs bg-white/60 rounded p-2">{aiResult.bio}</p>
            </div>
          )}

          {aiHasRoles && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Industry Roles</span>
                <InsertButton onClick={insertRoles} />
              </div>
              <div className="flex flex-wrap gap-1">
                {aiResult.primary_role && (
                  <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full font-medium">{aiResult.primary_role}</span>
                )}
                {aiResult.additional_roles?.map((role: string, i: number) => (
                  <span key={i} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{role}</span>
                ))}
              </div>
            </div>
          )}

          {aiHasKnownFor && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Known For</span>
                <InsertButton onClick={insertKnownFor} />
              </div>
              <div className="flex flex-wrap gap-1">
                {aiResult.known_for.map((title: string, i: number) => (
                  <span key={i} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{title}</span>
                ))}
              </div>
            </div>
          )}

          {aiHasRep && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Representation</span>
                <InsertButton onClick={insertRepresentation} />
              </div>
              <div className="text-xs text-gray-700 space-y-0.5 bg-white/60 rounded p-2">
                {aiResult.representation.agency && <div>Agency: <strong>{aiResult.representation.agency}</strong></div>}
                {aiResult.representation.agent && <div>Agent: {aiResult.representation.agent}</div>}
                {aiResult.representation.manager && <div>Manager: {aiResult.representation.manager}</div>}
              </div>
            </div>
          )}

          {aiResult.awards?.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Awards</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {aiResult.awards.map((award: string, i: number) => (
                  <span key={i} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{award}</span>
                ))}
              </div>
            </div>
          )}

          {/* Not found indicators */}
          {aiResult.searched_but_not_found?.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1 border-t border-purple-200">
              <span className="text-[10px] text-gray-400 mr-1 self-center">Not found:</span>
              {aiResult.searched_but_not_found.map((field: string, i: number) => (
                <span key={i} className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">{field}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Basic Info */}
      <div className="admin-card space-y-4">
        <h2 className="font-semibold text-gray-700">Basic Info</h2>
        <div>
          <label className="form-label">Name *</label>
          <input name="name" required defaultValue={v('name')} className="form-input" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Slug</label>
            <input name="slug" defaultValue={v('slug')} className="form-input" placeholder="auto-generated" />
          </div>
          <div>
            <label className="form-label">Location</label>
            <input name="location" defaultValue={locationVal} className="form-input" placeholder="Los Angeles, CA" />
          </div>
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

      {/* Roles (tag input) */}
      <div className="admin-card space-y-3">
        <h2 className="font-semibold text-gray-700">Industry Roles</h2>
        <div className="flex flex-wrap gap-1.5 min-h-[28px]">
          {roles.map((role, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-sm bg-purple-100 text-purple-800 px-2.5 py-1 rounded-full">
              {role}
              <button type="button" onClick={() => removeRole(i)} className="text-purple-400 hover:text-purple-700 ml-0.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newRole}
            onChange={e => setNewRole(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRole(newRole) } }}
            className="form-input flex-1"
            placeholder="Add role (e.g. Producer, Director)…"
          />
          <button type="button" onClick={() => addRole(newRole)} disabled={!newRole.trim()}
            className="text-sm font-medium text-purple-600 hover:text-purple-800 px-3 disabled:opacity-30">
            Add
          </button>
        </div>
      </div>

      {/* Profile Photo */}
      <div className="admin-card space-y-3">
        <h2 className="font-semibold text-gray-700">Profile Photo</h2>
        <ProfilePhotoField
          name="profile_image_url"
          initialValue={crew?.profile_image_url ?? ''}
          fallbackUrl={getCrewProfileImageUrl({
            profile_image_url: null,
            linkedin: linkedinVal,
          })}
          fallbackHint={
            linkedinVal
              ? 'Auto-pulled from LinkedIn via unavatar.io. Upload a custom photo to override.'
              : 'No photo set. Upload one or fill in LinkedIn URL below to auto-pull.'
          }
        />
      </div>

      {/* Contact & Social */}
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Instagram</label>
            <input name="instagram" defaultValue={instagramVal} className="form-input" placeholder="@handle" />
          </div>
          <div>
            <label className="form-label">IMDb URL</label>
            <input name="imdb" defaultValue={imdbVal} className="form-input" placeholder="https://imdb.com/name/…" />
          </div>
        </div>
      </div>

      {/* Bio / About */}
      <div className="admin-card space-y-4">
        <h2 className="font-semibold text-gray-700">Bio / About</h2>
        <textarea name="content" rows={5} defaultValue={bioVal} className="form-textarea"
          placeholder="Brief professional biography…" />
      </div>

      {/* Known For (tag input) */}
      <div className="admin-card space-y-3">
        <h2 className="font-semibold text-gray-700">Known For</h2>
        <div className="flex flex-wrap gap-1.5 min-h-[28px]">
          {knownFor.map((title, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-sm bg-blue-50 text-blue-800 px-2.5 py-1 rounded-full">
              {title}
              <button type="button" onClick={() => removeKnownFor(i)} className="text-blue-400 hover:text-blue-700 ml-0.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newKnownFor}
            onChange={e => setNewKnownFor(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKnownForItem(newKnownFor) } }}
            className="form-input flex-1"
            placeholder="Add film or series title…"
          />
          <button type="button" onClick={() => addKnownForItem(newKnownFor)} disabled={!newKnownFor.trim()}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 px-3 disabled:opacity-30">
            Add
          </button>
        </div>
      </div>

      {/* Representation */}
      <div className="admin-card space-y-4">
        <h2 className="font-semibold text-gray-700">Representation</h2>
        <div>
          <label className="form-label">Agency</label>
          <input name="rep_agency" defaultValue={rep?.agency ?? ''} className="form-input" placeholder="Talent agency name" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Agent</label>
            <input name="rep_agent" defaultValue={rep?.agent ?? ''} className="form-input" placeholder="Agent name" />
          </div>
          <div>
            <label className="form-label">Manager</label>
            <input name="rep_manager" defaultValue={rep?.manager ?? ''} className="form-input" placeholder="Manager name" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Saving…' : crew ? 'Update Person' : 'Create Person'}
        </button>
        <Link href="/admin/crew" className="btn-outline">Cancel</Link>
      </div>
    </form>

    {/* Confidence & Sources Panel — right sidebar */}
    {aiResult?.field_metadata && (
      <div className="w-80 flex-shrink-0 sticky top-6">
        <ConfidencePanel metadata={aiResult.field_metadata} aiResult={aiResult} />
      </div>
    )}
    </div>
  )
}

// ---- Sub-components ----

function InsertButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 hover:text-purple-900 bg-purple-100 hover:bg-purple-200 px-2 py-0.5 rounded transition-colors">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
      Insert
    </button>
  )
}

function AIField({ label, value, onInsert, confidence }: { label: string; value: string; onInsert: () => void; confidence?: number }) {
  const display = value.length > 40 ? value.substring(0, 37) + '…' : value
  return (
    <div className="flex items-center justify-between bg-white/60 rounded px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-purple-500 uppercase tracking-wider">{label}</span>
          {confidence != null && <ConfidenceDot score={confidence} />}
        </div>
        <p className="text-xs text-gray-700 truncate" title={value}>{display}</p>
      </div>
      <button type="button" onClick={onInsert}
        className="ml-2 flex-shrink-0 text-[10px] font-medium text-purple-600 hover:text-purple-800 bg-purple-100 hover:bg-purple-200 px-1.5 py-0.5 rounded transition-colors">
        ↓
      </button>
    </div>
  )
}

function ConfidenceDot({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = score >= 0.9 ? 'bg-green-500' : score >= 0.75 ? 'bg-emerald-400' : score >= 0.6 ? 'bg-yellow-400' : 'bg-orange-400'
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${color}`} title={`${pct}% confidence`} />
  )
}

function ConfidencePanel({ metadata, aiResult }: { metadata: Record<string, { confidence: number; sources: string[]; reasoning: string }>; aiResult: any }) {
  // Build ordered list of fields that have metadata
  const FIELD_LABELS: Record<string, string> = {
    email: 'Email', phone: 'Phone', website: 'Website',
    linkedin: 'LinkedIn', twitter: 'Twitter/X', instagram: 'Instagram',
    imdb: 'IMDb', bio: 'Bio', primary_role: 'Primary Role',
    known_for: 'Known For', representation: 'Representation',
    location: 'Location', awards: 'Awards',
  }

  const fields = Object.entries(metadata).filter(([key, val]) => val && val.confidence != null)

  // Overall confidence (average)
  const avgConfidence = fields.length > 0
    ? fields.reduce((sum, [, v]) => sum + v.confidence, 0) / fields.length
    : 0
  const overallPct = Math.round(avgConfidence * 100)

  const getBarColor = (score: number) => {
    if (score >= 0.9) return 'bg-green-500'
    if (score >= 0.75) return 'bg-emerald-400'
    if (score >= 0.6) return 'bg-yellow-400'
    return 'bg-orange-400'
  }

  const getLabel = (score: number) => {
    if (score >= 0.9) return 'Verified'
    if (score >= 0.75) return 'High'
    if (score >= 0.6) return 'Moderate'
    return 'Low'
  }

  return (
    <div className="admin-card border-purple-200 bg-white space-y-4">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <h3 className="font-semibold text-gray-900 text-sm">AI Confidence & Sources</h3>
      </div>

      {/* Overall score */}
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-gray-600">Overall Confidence</span>
          <span className={`text-xs font-bold ${avgConfidence >= 0.75 ? 'text-green-700' : avgConfidence >= 0.6 ? 'text-yellow-700' : 'text-orange-700'}`}>
            {overallPct}% — {getLabel(avgConfidence)}
          </span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${getBarColor(avgConfidence)}`} style={{ width: `${overallPct}%` }} />
        </div>
        <p className="text-[10px] text-gray-400 mt-1">{fields.length} data points evaluated</p>
      </div>

      {/* Per-field breakdown */}
      <div className="space-y-0.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
        {fields
          .sort(([, a], [, b]) => b.confidence - a.confidence)
          .map(([key, meta]) => {
          const pct = Math.round(meta.confidence * 100)
          return (
            <ConfidenceFieldRow
              key={key}
              label={FIELD_LABELS[key] || key}
              confidence={meta.confidence}
              pct={pct}
              sources={meta.sources}
              reasoning={meta.reasoning}
              barColor={getBarColor(meta.confidence)}
              levelLabel={getLabel(meta.confidence)}
            />
          )
        })}
      </div>

      <p className="text-[10px] text-gray-400 border-t border-gray-100 pt-2">
        Confidence scores reflect source reliability. Cross-referenced data from multiple verified sources scores higher.
      </p>
    </div>
  )
}

function ConfidenceFieldRow({
  label, confidence, pct, sources, reasoning, barColor, levelLabel,
}: {
  label: string; confidence: number; pct: number; sources: string[]; reasoning: string; barColor: string; levelLabel: string
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700">{label}</span>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold ${
              confidence >= 0.9 ? 'text-green-600' : confidence >= 0.75 ? 'text-emerald-600' : confidence >= 0.6 ? 'text-yellow-600' : 'text-orange-600'
            }`}>
              {pct}%
            </span>
            <svg className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        <div className="w-full h-1 bg-gray-100 rounded-full mt-1 overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-2.5 space-y-2 border-t border-gray-100 bg-gray-50/50">
          {/* Confidence level label */}
          <div className="flex items-center gap-1.5 pt-2">
            <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
              confidence >= 0.9 ? 'bg-green-100 text-green-700' :
              confidence >= 0.75 ? 'bg-emerald-100 text-emerald-700' :
              confidence >= 0.6 ? 'bg-yellow-100 text-yellow-700' :
              'bg-orange-100 text-orange-700'
            }`}>
              {levelLabel}
            </span>
          </div>

          {/* Sources */}
          {sources?.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Sources</span>
              <ul className="mt-0.5 space-y-0.5">
                {sources.map((src, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-600">
                    <svg className="w-3 h-3 text-purple-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <span>{src}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reasoning */}
          {reasoning && (
            <div>
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Reasoning</span>
              <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">{reasoning}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
