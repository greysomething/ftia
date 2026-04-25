'use client'

import { useActionState, useState, useCallback, useRef } from 'react'
import { savePitch, deletePitchAttachment } from '@/app/(site)/membership-account/my-pitches/actions'
import { PITCH_FORMAT_LABELS, BUDGET_RANGE_LABELS, DEVELOPMENT_STAGE_LABELS, slugify } from '@/lib/utils'
import type { PitchFormat, PitchBudgetRange, PitchDevelopmentStage, TaxonomyTerm, PitchAttachment } from '@/types/database'

interface Props {
  pitch?: any | null
  genres: TaxonomyTerm[]
  pitchGenreIds?: number[]
  attachments?: PitchAttachment[]
}

const FILE_TYPE_LABELS: Record<string, string> = {
  script: 'Script',
  'pitch-deck': 'Pitch Deck',
  treatment: 'Treatment',
  other: 'Other',
}

export function PitchForm({ pitch, genres, pitchGenreIds = [], attachments = [] }: Props) {
  const [state, action, pending] = useActionState(savePitch, null)
  const [visibility, setVisibility] = useState<string>(pitch?.visibility || 'draft')
  const [selectedGenres, setSelectedGenres] = useState<number[]>(pitchGenreIds)
  const [slugValue, setSlugValue] = useState(pitch?.slug ?? '')
  const [titleValue, setTitleValue] = useState(pitch?.title ?? '')
  const [loglineValue, setLoglineValue] = useState(pitch?.logline ?? '')
  const [uploading, setUploading] = useState(false)
  const [uploadFileType, setUploadFileType] = useState('script')
  const [localAttachments, setLocalAttachments] = useState<PitchAttachment[]>(attachments)
  const fileRef = useRef<HTMLInputElement>(null)

  const v = (key: string) => pitch?.[key] ?? ''

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value
    setTitleValue(newTitle)
    // Auto-generate slug only if slug hasn't been manually edited or is empty
    if (!slugValue || slugValue === slugify(titleValue)) {
      setSlugValue(slugify(newTitle))
    }
  }, [slugValue, titleValue])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !pitch?.id) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('pitch_id', String(pitch.id))
    fd.append('file_type', uploadFileType)
    try {
      const res = await fetch('/api/pitch-upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.ok) {
        setLocalAttachments(prev => [...prev, data.attachment])
      } else {
        alert(data.error || 'Upload failed')
      }
    } catch {
      alert('Upload failed')
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <form action={action}>
      {pitch?.id && <input type="hidden" name="id" value={pitch.id} />}
      <input type="hidden" name="genre_ids" value={JSON.stringify(selectedGenres)} />
      <input type="hidden" name="slug" value={slugValue} />
      <input type="hidden" name="visibility" value={visibility} />

      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 mb-6">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title */}
          <div>
            <label className="form-label">Title *</label>
            <input
              name="title"
              required
              value={titleValue}
              onChange={handleTitleChange}
              className="form-input"
              placeholder="Your pitch title"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="form-label">Slug</label>
            <input
              value={slugValue}
              onChange={e => setSlugValue(e.target.value)}
              className="form-input font-mono text-sm"
              placeholder="auto-generated-from-title"
            />
          </div>

          {/* Logline */}
          <div>
            <label className="form-label">Logline *</label>
            <textarea
              name="logline"
              required
              maxLength={300}
              rows={3}
              value={loglineValue}
              onChange={e => setLoglineValue(e.target.value)}
              className="form-input"
              placeholder="A concise summary of your story in one or two sentences"
            />
            <p className="text-xs text-gray-500 mt-1 text-right">
              {loglineValue.length} / 300
            </p>
          </div>

          {/* Synopsis */}
          <div>
            <label className="form-label">Synopsis</label>
            <textarea
              name="synopsis"
              rows={6}
              defaultValue={v('synopsis')}
              className="form-input"
              placeholder="A more detailed overview of your story, characters, and themes"
            />
          </div>

          {/* Comparable Titles */}
          <div>
            <label className="form-label">Comparable Titles</label>
            <input
              name="comparable_titles"
              defaultValue={v('comparable_titles')}
              className="form-input"
              placeholder="e.g., Succession meets The Bear"
            />
          </div>

          {/* Target Audience */}
          <div>
            <label className="form-label">Target Audience</label>
            <input
              name="target_audience"
              defaultValue={v('target_audience')}
              className="form-input"
              placeholder="Who is this for?"
            />
          </div>

          {/* Unique Selling Points */}
          <div>
            <label className="form-label">Unique Selling Points</label>
            <textarea
              name="unique_selling_points"
              rows={3}
              defaultValue={v('unique_selling_points')}
              className="form-input"
              placeholder="What makes this project stand out?"
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status card */}
          <div className="white-bg p-5">
            <h3 className="font-semibold text-gray-700 mb-3">Status</h3>
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="_visibility"
                  value="draft"
                  checked={visibility === 'draft'}
                  onChange={() => setVisibility('draft')}
                  className="text-primary focus:ring-primary"
                />
                Draft
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="_visibility"
                  value="publish"
                  checked={visibility === 'publish'}
                  onChange={() => setVisibility('publish')}
                  className="text-primary focus:ring-primary"
                />
                Publish
              </label>
            </div>
            <button type="submit" disabled={pending} className="btn-primary w-full">
              {pending
                ? 'Saving...'
                : visibility === 'draft'
                  ? 'Save Draft'
                  : 'Publish Pitch'}
            </button>
          </div>

          {/* Format card */}
          <div className="white-bg p-5">
            <h3 className="font-semibold text-gray-700 mb-3">Format</h3>
            <select name="format" defaultValue={v('format') || 'feature-film'} className="form-input">
              {Object.entries(PITCH_FORMAT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Budget Range card */}
          <div className="white-bg p-5">
            <h3 className="font-semibold text-gray-700 mb-3">Budget Range</h3>
            <select name="budget_range" defaultValue={v('budget_range') || ''} className="form-input">
              <option value="">Not specified</option>
              {Object.entries(BUDGET_RANGE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Development Stage card */}
          <div className="white-bg p-5">
            <h3 className="font-semibold text-gray-700 mb-3">Development Stage</h3>
            <select name="development_stage" defaultValue={v('development_stage') || 'concept'} className="form-input">
              {Object.entries(DEVELOPMENT_STAGE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Genre card */}
          <div className="white-bg p-5">
            <h3 className="font-semibold text-gray-700 mb-3">Genres</h3>
            <p className="text-xs text-gray-500 mb-2">First selected genre becomes primary.</p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {genres.map(genre => (
                <label key={genre.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                  <input
                    type="checkbox"
                    checked={selectedGenres.includes(genre.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedGenres(prev => [...prev, genre.id])
                      } else {
                        setSelectedGenres(prev => prev.filter(id => id !== genre.id))
                      }
                    }}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  {genre.name}
                </label>
              ))}
            </div>
          </div>

          {/* Attachments card */}
          <div className="white-bg p-5">
            <h3 className="font-semibold text-gray-700 mb-3">Attachments</h3>
            {pitch?.id ? (
              <>
                {/* Existing attachments */}
                {localAttachments.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {localAttachments.map(att => {
                      const boundDelete = deletePitchAttachment.bind(null, att.id)
                      return (
                        <div key={att.id} className="flex items-center justify-between gap-2 text-sm bg-gray-50 rounded px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate">{att.file_name}</span>
                            <span className="inline-block text-[10px] font-medium bg-gray-200 text-gray-600 rounded px-1.5 py-0.5 whitespace-nowrap">
                              {FILE_TYPE_LABELS[att.file_type] || att.file_type}
                            </span>
                          </div>
                          <form action={boundDelete}>
                            <button
                              type="submit"
                              className="text-red-500 hover:text-red-700 text-xs whitespace-nowrap"
                              onClick={e => {
                                if (!confirm('Delete this attachment?')) e.preventDefault()
                                else setLocalAttachments(prev => prev.filter(a => a.id !== att.id))
                              }}
                            >
                              Delete
                            </button>
                          </form>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Upload */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={uploadFileType}
                      onChange={e => setUploadFileType(e.target.value)}
                      className="form-input text-sm flex-1"
                    >
                      <option value="script">Script</option>
                      <option value="pitch-deck">Pitch Deck</option>
                      <option value="treatment">Treatment</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <label className="btn-outline text-sm cursor-pointer inline-block text-center w-full">
                    {uploading ? 'Uploading...' : 'Upload PDF'}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                Save your pitch first to upload attachments.
              </p>
            )}
          </div>
        </div>
      </div>
    </form>
  )
}
