'use client'

import { useState } from 'react'
import Link from 'next/link'

interface EditSuggestButtonProps {
  /** Admin edit URL (e.g. /admin/productions/123/edit) */
  editUrl: string
  /** Entity type for suggest edit form */
  entityType: 'production' | 'company' | 'crew'
  /** Entity title for display */
  entityTitle: string
  /** Entity ID */
  entityId: number
  /** Is the current user an admin? */
  isAdmin: boolean
  /** Is the current user logged in? */
  isLoggedIn: boolean
}

export function EditSuggestButton({
  editUrl,
  entityType,
  entityTitle,
  entityId,
  isAdmin,
  isLoggedIn,
}: EditSuggestButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const [suggestion, setSuggestion] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!suggestion.trim()) return
    setSending(true)
    try {
      await fetch('/api/suggest-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType,
          entityId,
          entityTitle,
          suggestion: suggestion.trim(),
        }),
      })
      setSent(true)
      setTimeout(() => {
        setShowModal(false)
        setSent(false)
        setSuggestion('')
      }, 2000)
    } finally {
      setSending(false)
    }
  }

  // Admin: show edit link
  if (isAdmin) {
    return (
      <Link
        href={editUrl}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-md hover:bg-gray-50 hover:text-primary hover:border-primary/30 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Edit
      </Link>
    )
  }

  // Logged-in user: show suggest edit
  if (isLoggedIn) {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 bg-white border border-gray-200 rounded-md hover:bg-gray-50 hover:text-gray-600 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          Suggest Edit
        </button>

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
              {sent ? (
                <div className="text-center py-6">
                  <svg className="w-12 h-12 text-green-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-900">Thank you!</h3>
                  <p className="text-sm text-gray-500 mt-1">Your suggestion has been submitted for review.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Suggest an Edit</h3>
                    <button type="button" onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 mb-1">
                    <span className="font-medium text-gray-700">{entityTitle}</span>
                  </p>
                  <p className="text-xs text-gray-400 mb-4">
                    Have updated contact info, corrections, or additional details? Let us know.
                  </p>
                  <textarea
                    value={suggestion}
                    onChange={e => setSuggestion(e.target.value)}
                    placeholder="Describe what should be updated or corrected..."
                    rows={4}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
                    required
                  />
                  <div className="flex justify-end gap-2 mt-4">
                    <button type="button" onClick={() => setShowModal(false)} className="btn-outline text-sm py-2 px-4">
                      Cancel
                    </button>
                    <button type="submit" disabled={sending || !suggestion.trim()} className="btn-primary text-sm py-2 px-4">
                      {sending ? 'Sending...' : 'Submit Suggestion'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </>
    )
  }

  // Not logged in: hide
  return null
}
