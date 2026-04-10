'use client'

import { useState, useEffect, useRef, useCallback, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { saveSubmissionDraft, submitForReview } from '@/app/(site)/submit-production/actions'
import type { ProductionSubmission, SubmissionCrewEntry, SubmissionLocationEntry } from '@/types/database'

interface Props {
  submission?: ProductionSubmission | null
  typeOptions: string[]
  statusOptions: string[]
  rateLimit: { allowed: boolean; remaining: number; cap: number; resetInHours: number }
}

export default function SubmissionForm({ submission, typeOptions, statusOptions, rateLimit }: Props) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [saveState, saveAction] = useActionState(saveSubmissionDraft, null)
  const [submitState, submitAction] = useActionState(submitForReview, null)

  // Track submission ID (may start null for new drafts)
  const [submissionId, setSubmissionId] = useState<number | null>(submission?.id ?? null)

  // Form fields
  const [title, setTitle] = useState(submission?.title ?? '')
  const [description, setDescription] = useState(submission?.description ?? '')
  const [startDate, setStartDate] = useState(submission?.start_date ?? '')
  const [endDate, setEndDate] = useState(submission?.end_date ?? '')
  const [productionCompany, setProductionCompany] = useState(submission?.production_company ?? '')
  const [director, setDirector] = useState(submission?.director ?? '')
  const [producer, setProducer] = useState(submission?.producer ?? '')
  const [writer, setWriter] = useState(submission?.writer ?? '')
  const [castingDirector, setCastingDirector] = useState(submission?.casting_director ?? '')
  const [typeName, setTypeName] = useState(submission?.type_name ?? '')
  const [statusName, setStatusName] = useState(submission?.status_name ?? '')
  const [notes, setNotes] = useState(submission?.notes ?? '')
  const [extraCrew, setExtraCrew] = useState<SubmissionCrewEntry[]>(submission?.extra_crew ?? [])
  const [locations, setLocations] = useState<SubmissionLocationEntry[]>(
    submission?.locations?.length ? submission.locations : [{ city: '', country: '' }]
  )

  // Auto-save state
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isDirtyRef = useRef(false)

  // Track when save completes
  useEffect(() => {
    if (saveState?.success && saveState.submissionId) {
      setSubmissionId(saveState.submissionId)
      setLastSaved(new Date().toLocaleTimeString())
      setSaving(false)
      isDirtyRef.current = false
    } else if (saveState?.error) {
      setSaving(false)
    }
  }, [saveState])

  // Handle submit result
  useEffect(() => {
    if (submitState?.redirectTo) {
      router.push(submitState.redirectTo)
    } else if (submitState?.error) {
      setSubmitting(false)
    }
  }, [submitState, router])

  // Mark dirty on field changes
  const markDirty = useCallback(() => {
    isDirtyRef.current = true
    // Reset auto-save timer
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      if (isDirtyRef.current && formRef.current) {
        setSaving(true)
        // Trigger save via hidden button
        const saveBtn = formRef.current.querySelector('button[name="action"][value="save"]') as HTMLButtonElement
        saveBtn?.click()
      }
    }, 3000)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [])

  // Location management
  function addLocation() {
    setLocations([...locations, { city: '', country: '' }])
    markDirty()
  }
  function removeLocation(idx: number) {
    setLocations(locations.filter((_, i) => i !== idx))
    markDirty()
  }
  function updateLocation(idx: number, field: keyof SubmissionLocationEntry, value: string) {
    const updated = [...locations]
    updated[idx] = { ...updated[idx], [field]: value }
    setLocations(updated)
    markDirty()
  }

  // Extra crew management
  function addCrewMember() {
    setExtraCrew([...extraCrew, { role: '', name: '' }])
    markDirty()
  }
  function removeCrewMember(idx: number) {
    setExtraCrew(extraCrew.filter((_, i) => i !== idx))
    markDirty()
  }
  function updateCrewMember(idx: number, field: keyof SubmissionCrewEntry, value: string) {
    const updated = [...extraCrew]
    updated[idx] = { ...updated[idx], [field]: value }
    setExtraCrew(updated)
    markDirty()
  }

  const isReadOnly = submission?.status === 'pending' || submission?.status === 'approved' || submission?.status === 'rejected'
  const error = submitState?.error || (saveState?.error && !saving ? saveState.error : null)

  function handleFormAction(formData: FormData) {
    const action = formData.get('action')
    if (action === 'submit') {
      setSubmitting(true)
      submitAction(formData)
    } else {
      setSaving(true)
      saveAction(formData)
    }
  }

  return (
    <form ref={formRef} action={handleFormAction} className="space-y-6">
      {submissionId && <input type="hidden" name="id" value={submissionId} />}
      <input type="hidden" name="extra_crew" value={JSON.stringify(extraCrew)} />
      <input type="hidden" name="locations" value={JSON.stringify(locations)} />

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {isReadOnly && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
          This submission is {submission?.status} and cannot be edited.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content — left 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title */}
          <div>
            <label className="form-label">Title *</label>
            <input
              name="title"
              value={title}
              onChange={(e) => { setTitle(e.target.value); markDirty() }}
              className="form-input"
              placeholder="Production title"
              disabled={isReadOnly}
            />
          </div>

          {/* Description */}
          <div>
            <label className="form-label">Description *</label>
            <textarea
              name="description"
              value={description}
              onChange={(e) => { setDescription(e.target.value); markDirty() }}
              className="form-input"
              rows={5}
              placeholder="Brief description of the production (synopsis, premise, what it's about)"
              disabled={isReadOnly}
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Start Date</label>
              <input
                type="date"
                name="start_date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); markDirty() }}
                className="form-input"
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label className="form-label">End Date</label>
              <input
                type="date"
                name="end_date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); markDirty() }}
                className="form-input"
                disabled={isReadOnly}
              />
            </div>
          </div>

          {/* Locations */}
          <div>
            <label className="form-label">Locations *</label>
            <p className="text-xs text-gray-500 mb-2">Where is this production based? At least one location with city and country required.</p>
            {locations.map((loc, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <input
                  value={loc.city}
                  onChange={(e) => updateLocation(idx, 'city', e.target.value)}
                  className="form-input flex-1"
                  placeholder="City"
                  disabled={isReadOnly}
                />
                <input
                  value={loc.stage ?? ''}
                  onChange={(e) => updateLocation(idx, 'stage', e.target.value)}
                  className="form-input flex-1"
                  placeholder="State/Province (optional)"
                  disabled={isReadOnly}
                />
                <input
                  value={loc.country}
                  onChange={(e) => updateLocation(idx, 'country', e.target.value)}
                  className="form-input flex-1"
                  placeholder="Country"
                  disabled={isReadOnly}
                />
                {locations.length > 1 && !isReadOnly && (
                  <button type="button" onClick={() => removeLocation(idx)} className="text-red-500 hover:text-red-700 px-2">
                    &times;
                  </button>
                )}
              </div>
            ))}
            {!isReadOnly && (
              <button type="button" onClick={addLocation} className="text-sm text-primary hover:underline">
                + Add another location
              </button>
            )}
          </div>

          {/* Key Crew */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Director</label>
              <input
                name="director"
                value={director}
                onChange={(e) => { setDirector(e.target.value); markDirty() }}
                className="form-input"
                placeholder="Director name"
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label className="form-label">Producer</label>
              <input
                name="producer"
                value={producer}
                onChange={(e) => { setProducer(e.target.value); markDirty() }}
                className="form-input"
                placeholder="Producer name"
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label className="form-label">Writer</label>
              <input
                name="writer"
                value={writer}
                onChange={(e) => { setWriter(e.target.value); markDirty() }}
                className="form-input"
                placeholder="Writer name"
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label className="form-label">Casting Director</label>
              <input
                name="casting_director"
                value={castingDirector}
                onChange={(e) => { setCastingDirector(e.target.value); markDirty() }}
                className="form-input"
                placeholder="Casting director name"
                disabled={isReadOnly}
              />
            </div>
          </div>

          {/* Extra Crew */}
          <div>
            <label className="form-label">Additional Crew</label>
            {extraCrew.map((crew, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <input
                  value={crew.role}
                  onChange={(e) => updateCrewMember(idx, 'role', e.target.value)}
                  className="form-input flex-1"
                  placeholder="Role (e.g. DP, Line Producer)"
                  disabled={isReadOnly}
                />
                <input
                  value={crew.name}
                  onChange={(e) => updateCrewMember(idx, 'name', e.target.value)}
                  className="form-input flex-1"
                  placeholder="Name"
                  disabled={isReadOnly}
                />
                {!isReadOnly && (
                  <button type="button" onClick={() => removeCrewMember(idx)} className="text-red-500 hover:text-red-700 px-2">
                    &times;
                  </button>
                )}
              </div>
            ))}
            {!isReadOnly && (
              <button type="button" onClick={addCrewMember} className="text-sm text-primary hover:underline">
                + Add crew member
              </button>
            )}
          </div>

          {/* Notes to admin */}
          <div>
            <label className="form-label">Notes to Admin</label>
            <textarea
              name="notes"
              value={notes}
              onChange={(e) => { setNotes(e.target.value); markDirty() }}
              className="form-input"
              rows={3}
              placeholder="Any additional information for our team (optional)"
              disabled={isReadOnly}
            />
          </div>
        </div>

        {/* Sidebar — right 1/3 */}
        <div className="space-y-6">
          {/* Type & Status */}
          <div className="white-bg p-4 space-y-4">
            <div>
              <label className="form-label">Production Type</label>
              <input
                name="type_name"
                list="type-options"
                value={typeName}
                onChange={(e) => { setTypeName(e.target.value); markDirty() }}
                className="form-input"
                placeholder="e.g. Feature Film, TV Series"
                disabled={isReadOnly}
              />
              <datalist id="type-options">
                {typeOptions.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>

            <div>
              <label className="form-label">Production Status</label>
              <input
                name="status_name"
                list="status-options"
                value={statusName}
                onChange={(e) => { setStatusName(e.target.value); markDirty() }}
                className="form-input"
                placeholder="e.g. In Development, Pre-Production"
                disabled={isReadOnly}
              />
              <datalist id="status-options">
                {statusOptions.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>

            <div>
              <label className="form-label">Production Company *</label>
              <input
                name="production_company"
                value={productionCompany}
                onChange={(e) => { setProductionCompany(e.target.value); markDirty() }}
                className="form-input"
                placeholder="Company name"
                disabled={isReadOnly}
              />
            </div>
          </div>

          {/* Actions */}
          {!isReadOnly && (
            <div className="white-bg p-4 space-y-3">
              <button
                type="submit"
                name="action"
                value="save"
                disabled={saving}
                className="w-full px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Draft'}
              </button>

              <button
                type="submit"
                name="action"
                value="submit"
                disabled={submitting || !rateLimit.allowed}
                className="w-full px-4 py-2 bg-primary text-white text-sm font-medium rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit for Review'}
              </button>

              {!rateLimit.allowed && (
                <p className="text-xs text-red-600">
                  Daily limit reached ({rateLimit.cap}/day). Try again in {rateLimit.resetInHours}h.
                </p>
              )}

              {rateLimit.allowed && rateLimit.remaining < rateLimit.cap && (
                <p className="text-xs text-gray-500">
                  {rateLimit.remaining} submission{rateLimit.remaining === 1 ? '' : 's'} remaining today
                </p>
              )}

              {lastSaved && (
                <p className="text-xs text-green-600 text-center">Draft saved at {lastSaved}</p>
              )}

              <div className="border-t pt-3 mt-3">
                <p className="text-xs text-gray-500">
                  <strong>Required fields:</strong> Title, Description, Production Company, at least one Director or Producer, at least one Location (city + country).
                </p>
              </div>
            </div>
          )}

          {/* Status badge for read-only */}
          {isReadOnly && submission && (
            <div className="white-bg p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Status</p>
              <span className={`text-sm px-3 py-1 rounded-full font-medium ${
                submission.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                submission.status === 'approved' ? 'bg-green-100 text-green-700' :
                'bg-red-100 text-red-700'
              }`}>
                {submission.status === 'pending' ? 'Pending Review' :
                 submission.status === 'approved' ? 'Approved' : 'Rejected'}
              </span>
              {submission.status === 'rejected' && submission.rejection_reason && (
                <div className="mt-3 p-3 bg-red-50 rounded text-sm text-red-700">
                  <strong>Reason:</strong> {submission.rejection_reason}
                </div>
              )}
              {submission.status === 'approved' && submission.published_production_id && (
                <a
                  href={`/productions`}
                  className="block mt-3 text-sm text-primary hover:underline"
                >
                  View published production
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </form>
  )
}
