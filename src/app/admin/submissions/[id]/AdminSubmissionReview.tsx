'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ProductionSubmission, SubmissionCrewEntry, SubmissionLocationEntry } from '@/types/database'

interface Props {
  submission: ProductionSubmission
  typeOptions: string[]
  statusOptions: string[]
}

export default function AdminSubmissionReview({ submission, typeOptions, statusOptions }: Props) {
  const router = useRouter()

  // Editable fields (admin can modify before approving)
  const [title, setTitle] = useState(submission.title ?? '')
  const [description, setDescription] = useState(submission.description ?? '')
  const [startDate, setStartDate] = useState(submission.start_date ?? '')
  const [endDate, setEndDate] = useState(submission.end_date ?? '')
  const [productionCompany, setProductionCompany] = useState(submission.production_company ?? '')
  const [director, setDirector] = useState(submission.director ?? '')
  const [producer, setProducer] = useState(submission.producer ?? '')
  const [writer, setWriter] = useState(submission.writer ?? '')
  const [castingDirector, setCastingDirector] = useState(submission.casting_director ?? '')
  const [typeName, setTypeName] = useState(submission.type_name ?? '')
  const [statusName, setStatusName] = useState(submission.status_name ?? '')
  const [extraCrew, setExtraCrew] = useState<SubmissionCrewEntry[]>(submission.extra_crew ?? [])
  const [locations, setLocations] = useState<SubmissionLocationEntry[]>(
    submission.locations?.length ? submission.locations : [{ city: '', country: '' }]
  )

  // UI state
  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const isPending = submission.status === 'pending'
  const isApproved = submission.status === 'approved'
  const isRejected = submission.status === 'rejected'

  function getFormData(): Record<string, any> {
    return {
      title, description, start_date: startDate, end_date: endDate,
      production_company: productionCompany, director, producer, writer,
      casting_director: castingDirector, type_name: typeName, status_name: statusName,
      extra_crew: extraCrew, locations,
    }
  }

  // Save edits (admin editing before approve)
  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/submissions/${submission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getFormData()),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setSuccess('Changes saved.')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // AI Enrichment
  async function handleEnrich() {
    setEnriching(true)
    setError('')
    try {
      const res = await fetch('/api/admin/ai-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'production',
          name: title,
          existingData: {
            title, description,
            production_company: productionCompany,
            director, producer, writer, casting_director: castingDirector,
            locations: locations.map(l => `${l.city}, ${l.country}`).join('; '),
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI research failed')

      const result = data.data
      if (!result) throw new Error('No data returned from AI')

      // Apply enrichment results to empty fields only
      if (result.synopsis && !description) setDescription(result.synopsis)
      if (result.production_types?.[0] && !typeName) setTypeName(result.production_types[0])
      if (result.production_statuses?.[0] && !statusName) setStatusName(result.production_statuses[0])
      if (result.production_date_start && !startDate) setStartDate(result.production_date_start)
      if (result.production_date_end && !endDate) setEndDate(result.production_date_end)

      // Merge crew if empty
      if (result.crew?.length) {
        const newCrew: SubmissionCrewEntry[] = []
        for (const c of result.crew) {
          const role = c.role?.toLowerCase()
          if (role?.includes('director') && !director && !role.includes('casting')) {
            setDirector(c.name)
          } else if (role?.includes('producer') && !producer) {
            setProducer(c.name)
          } else if (role?.includes('writer') && !writer) {
            setWriter(c.name)
          } else if (role?.includes('casting') && !castingDirector) {
            setCastingDirector(c.name)
          } else if (c.role && c.name) {
            newCrew.push({ role: c.role, name: c.name })
          }
        }
        if (newCrew.length > 0 && extraCrew.length === 0) {
          setExtraCrew(newCrew)
        }
      }

      // Merge locations if empty
      if (result.locations?.length && locations.length <= 1 && !locations[0]?.city) {
        const newLocs: SubmissionLocationEntry[] = result.locations.map((l: any) => ({
          city: l.city || '',
          stage: l.stage || l.state || '',
          country: l.country || '',
        }))
        setLocations(newLocs)
      }

      // Merge companies
      if (result.companies?.[0]?.name && !productionCompany) {
        setProductionCompany(result.companies[0].name)
      }

      setSuccess('AI enrichment applied to empty fields. Review the results.')
      setTimeout(() => setSuccess(''), 5000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setEnriching(false)
    }
  }

  // Approve
  async function handleApprove() {
    if (!title) { setError('Title is required to approve.'); return }
    if (!typeName) { setError('Production type is required to approve.'); return }

    setApproving(true)
    setError('')
    try {
      // Save latest edits first
      const saveRes = await fetch(`/api/admin/submissions/${submission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getFormData()),
      })
      if (!saveRes.ok) {
        const d = await saveRes.json()
        throw new Error(d.error || 'Failed to save edits before approving')
      }

      // Approve
      const res = await fetch(`/api/admin/submissions/${submission.id}/approve`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to approve')

      setSuccess(`Approved! Production created (ID: ${data.productionId}).`)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setApproving(false)
    }
  }

  // Reject
  async function handleReject() {
    setRejecting(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/submissions/${submission.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectionReason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reject')

      setShowRejectModal(false)
      setSuccess('Submission rejected.')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setRejecting(false)
    }
  }

  // Location management
  function addLocation() { setLocations([...locations, { city: '', country: '' }]) }
  function removeLocation(idx: number) { setLocations(locations.filter((_, i) => i !== idx)) }
  function updateLocation(idx: number, field: keyof SubmissionLocationEntry, value: string) {
    const updated = [...locations]
    updated[idx] = { ...updated[idx], [field]: value }
    setLocations(updated)
  }

  // Crew management
  function addCrewMember() { setExtraCrew([...extraCrew, { role: '', name: '' }]) }
  function removeCrewMember(idx: number) { setExtraCrew(extraCrew.filter((_, i) => i !== idx)) }
  function updateCrewMember(idx: number, field: keyof SubmissionCrewEntry, value: string) {
    const updated = [...extraCrew]
    updated[idx] = { ...updated[idx], [field]: value }
    setExtraCrew(updated)
  }

  const canEdit = isPending
  const inputClass = `w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${!canEdit ? 'bg-gray-50 text-gray-500' : ''}`

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/submissions" className="text-sm text-gray-500 hover:text-blue-600">
          &larr; Back to Submissions
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {submission.title || 'Untitled Submission'}
        </h1>
        <span className={`text-sm px-3 py-1 rounded-full font-medium ${
          isPending ? 'bg-yellow-100 text-yellow-800' :
          isApproved ? 'bg-green-100 text-green-700' :
          isRejected ? 'bg-red-100 text-red-700' :
          'bg-gray-100 text-gray-600'
        }`}>
          {submission.status.charAt(0).toUpperCase() + submission.status.slice(1)}
        </span>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 mb-4">
          {success}
        </div>
      )}

      {/* User notes */}
      {submission.notes && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium text-blue-800 mb-1">Notes from submitter:</p>
          <p className="text-sm text-blue-700">{submission.notes}</p>
        </div>
      )}

      {/* Rejection reason (if rejected) */}
      {isRejected && submission.rejection_reason && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium text-red-800 mb-1">Rejection reason:</p>
          <p className="text-sm text-red-700">{submission.rejection_reason}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main fields */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} disabled={!canEdit} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} rows={5} disabled={!canEdit} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} disabled={!canEdit} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} disabled={!canEdit} />
              </div>
            </div>

            {/* Locations */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Locations</label>
              {locations.map((loc, idx) => (
                <div key={idx} className="flex gap-2 mb-2">
                  <input value={loc.city} onChange={(e) => updateLocation(idx, 'city', e.target.value)}
                    className={inputClass} placeholder="City" disabled={!canEdit} />
                  <input value={loc.stage ?? ''} onChange={(e) => updateLocation(idx, 'stage', e.target.value)}
                    className={inputClass} placeholder="State/Province" disabled={!canEdit} />
                  <input value={loc.country} onChange={(e) => updateLocation(idx, 'country', e.target.value)}
                    className={inputClass} placeholder="Country" disabled={!canEdit} />
                  {canEdit && locations.length > 1 && (
                    <button type="button" onClick={() => removeLocation(idx)} className="text-red-500 hover:text-red-700 px-2">&times;</button>
                  )}
                </div>
              ))}
              {canEdit && (
                <button type="button" onClick={addLocation} className="text-sm text-blue-600 hover:underline">
                  + Add location
                </button>
              )}
            </div>

            {/* Key Crew */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Director</label>
                <input value={director} onChange={(e) => setDirector(e.target.value)} className={inputClass} disabled={!canEdit} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Producer</label>
                <input value={producer} onChange={(e) => setProducer(e.target.value)} className={inputClass} disabled={!canEdit} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Writer</label>
                <input value={writer} onChange={(e) => setWriter(e.target.value)} className={inputClass} disabled={!canEdit} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Casting Director</label>
                <input value={castingDirector} onChange={(e) => setCastingDirector(e.target.value)} className={inputClass} disabled={!canEdit} />
              </div>
            </div>

            {/* Extra Crew */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Additional Crew</label>
              {extraCrew.map((crew, idx) => (
                <div key={idx} className="flex gap-2 mb-2">
                  <input value={crew.role} onChange={(e) => updateCrewMember(idx, 'role', e.target.value)}
                    className={inputClass} placeholder="Role" disabled={!canEdit} />
                  <input value={crew.name} onChange={(e) => updateCrewMember(idx, 'name', e.target.value)}
                    className={inputClass} placeholder="Name" disabled={!canEdit} />
                  {canEdit && (
                    <button type="button" onClick={() => removeCrewMember(idx)} className="text-red-500 hover:text-red-700 px-2">&times;</button>
                  )}
                </div>
              ))}
              {canEdit && (
                <button type="button" onClick={addCrewMember} className="text-sm text-blue-600 hover:underline">
                  + Add crew member
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Type & Status */}
          <div className="bg-white rounded-lg shadow-sm border p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Production Type</label>
              <input list="admin-type-options" value={typeName} onChange={(e) => setTypeName(e.target.value)}
                className={inputClass} disabled={!canEdit} />
              <datalist id="admin-type-options">
                {typeOptions.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Production Status</label>
              <input list="admin-status-options" value={statusName} onChange={(e) => setStatusName(e.target.value)}
                className={inputClass} disabled={!canEdit} />
              <datalist id="admin-status-options">
                {statusOptions.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Production Company</label>
              <input value={productionCompany} onChange={(e) => setProductionCompany(e.target.value)}
                className={inputClass} disabled={!canEdit} />
            </div>
          </div>

          {/* Actions */}
          {isPending && (
            <div className="bg-white rounded-lg shadow-sm border p-4 space-y-3">
              <button
                onClick={handleEnrich}
                disabled={enriching || !title}
                className="w-full px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {enriching ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Enriching...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Enrich with AI
                  </>
                )}
              </button>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>

              <hr className="border-gray-200" />

              <button
                onClick={handleApprove}
                disabled={approving}
                className="w-full px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {approving ? 'Approving...' : 'Approve & Publish'}
              </button>

              <button
                onClick={() => setShowRejectModal(true)}
                className="w-full px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 transition-colors"
              >
                Reject
              </button>
            </div>
          )}

          {/* Info */}
          <div className="bg-white rounded-lg shadow-sm border p-4 text-sm text-gray-500 space-y-2">
            <p><strong>Submitted:</strong> {submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : '-'}</p>
            <p><strong>Created:</strong> {new Date(submission.created_at).toLocaleString()}</p>
            {submission.reviewed_at && (
              <p><strong>Reviewed:</strong> {new Date(submission.reviewed_at).toLocaleString()}</p>
            )}
            {isApproved && submission.published_production_id && (
              <p>
                <strong>Production:</strong>{' '}
                <Link href={`/admin/productions/${submission.published_production_id}`} className="text-blue-600 hover:underline">
                  #{submission.published_production_id}
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Reject Submission</h2>
            <p className="text-sm text-gray-600 mb-4">
              Optionally provide a reason. The submitter will be notified by email.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none mb-4"
              rows={3}
              placeholder="Reason for rejection (optional)"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRejectModal(false)}
                disabled={rejecting}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={rejecting}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {rejecting ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
