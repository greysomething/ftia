'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

interface Suggestion {
  id: number
  entity_type: string
  entity_id: number
  entity_title: string | null
  suggestion: string
  user_id: string | null
  user_email: string | null
  status: string
  admin_notes: string | null
  created_at: string
  updated_at: string
}

function getEditUrl(type: string, id: number) {
  switch (type) {
    case 'production': return `/admin/productions/${id}/edit`
    case 'company': return `/admin/companies/${id}/edit`
    case 'crew': return `/admin/crew/${id}/edit`
    default: return '#'
  }
}

function getPublicUrl(type: string, slug?: string) {
  if (!slug) return null
  switch (type) {
    case 'production': return `/production/${slug}`
    case 'company': return `/production-contact/${slug}`
    case 'crew': return `/production-role/${slug}`
    default: return null
  }
}

function EntityBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    production: 'bg-blue-100 text-blue-700',
    company: 'bg-purple-100 text-purple-700',
    crew: 'bg-green-100 text-green-700',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[type] ?? 'bg-gray-100 text-gray-600'}`}>
      {type}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    applied: 'bg-green-100 text-green-700',
    dismissed: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

export function SuggestionsClient({
  initialPending,
  initialReviewed,
}: {
  initialPending: Suggestion[]
  initialReviewed: Suggestion[]
}) {
  const [pending, setPending] = useState(initialPending)
  const [reviewed, setReviewed] = useState(initialReviewed)
  const [processing, setProcessing] = useState<number | null>(null)
  const [notesOpen, setNotesOpen] = useState<number | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [tab, setTab] = useState<'pending' | 'reviewed'>('pending')

  async function handleAction(id: number, action: 'applied' | 'dismissed') {
    setProcessing(id)
    try {
      const res = await fetch('/api/admin/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: action, admin_notes: adminNotes || null }),
      })
      if (res.ok) {
        const item = pending.find(s => s.id === id)
        if (item) {
          const updated = { ...item, status: action, admin_notes: adminNotes || null, updated_at: new Date().toISOString() }
          setPending(prev => prev.filter(s => s.id !== id))
          setReviewed(prev => [updated, ...prev])
        }
        setNotesOpen(null)
        setAdminNotes('')
      }
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('pending')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            tab === 'pending' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Pending
          {pending.length > 0 && (
            <span className="ml-1.5 bg-amber-100 text-amber-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
              {pending.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('reviewed')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            tab === 'reviewed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Reviewed
          <span className="ml-1.5 text-xs text-gray-400">{reviewed.length}</span>
        </button>
      </div>

      {tab === 'pending' && (
        pending.length === 0 ? (
          <div className="white-bg p-8 text-center text-gray-400 text-sm">
            No pending suggestions. All caught up!
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(s => (
              <div key={s.id} className="white-bg p-5 border-l-4 border-amber-400">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <EntityBadge type={s.entity_type} />
                      <Link
                        href={getEditUrl(s.entity_type, s.entity_id)}
                        className="font-medium text-primary hover:underline text-sm"
                      >
                        {s.entity_title || `#${s.entity_id}`}
                      </Link>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{s.suggestion}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>{s.user_email ?? 'Unknown user'}</span>
                      <span>{formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Link
                      href={getEditUrl(s.entity_type, s.entity_id)}
                      className="text-xs text-center px-3 py-1.5 bg-primary text-white rounded-md hover:bg-primary/90 font-medium"
                    >
                      Edit Record
                    </Link>
                    <button
                      onClick={() => handleAction(s.id, 'applied')}
                      disabled={processing === s.id}
                      className="text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-md hover:bg-green-100 font-medium disabled:opacity-50"
                    >
                      Mark Applied
                    </button>
                    <button
                      onClick={() => {
                        if (notesOpen === s.id) {
                          setNotesOpen(null)
                        } else {
                          setNotesOpen(s.id)
                          setAdminNotes('')
                        }
                      }}
                      className="text-xs px-3 py-1.5 bg-gray-50 text-gray-500 border border-gray-200 rounded-md hover:bg-gray-100 font-medium"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>

                {notesOpen === s.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <textarea
                      value={adminNotes}
                      onChange={e => setAdminNotes(e.target.value)}
                      placeholder="Optional: reason for dismissal..."
                      rows={2}
                      className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none mb-2"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(s.id, 'dismissed')}
                        disabled={processing === s.id}
                        className="text-xs px-3 py-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-700 font-medium disabled:opacity-50"
                      >
                        {processing === s.id ? 'Dismissing...' : 'Confirm Dismiss'}
                      </button>
                      <button
                        onClick={() => { setNotesOpen(null); setAdminNotes('') }}
                        className="text-xs px-3 py-1.5 text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'reviewed' && (
        reviewed.length === 0 ? (
          <div className="white-bg p-8 text-center text-gray-400 text-sm">
            No reviewed suggestions yet.
          </div>
        ) : (
          <div className="space-y-2">
            {reviewed.map(s => (
              <div key={s.id} className="white-bg p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <EntityBadge type={s.entity_type} />
                    <StatusBadge status={s.status} />
                    <span className="text-sm font-medium text-gray-700">{s.entity_title || `#${s.entity_id}`}</span>
                  </div>
                  <p className="text-sm text-gray-500 line-clamp-2">{s.suggestion}</p>
                  {s.admin_notes && (
                    <p className="text-xs text-gray-400 mt-1 italic">Note: {s.admin_notes}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                    <span>{s.user_email ?? 'Unknown'}</span>
                    <span>{formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
