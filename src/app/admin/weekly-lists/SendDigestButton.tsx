'use client'

import { useState } from 'react'

export function SendDigestButton({ currentWeekCount }: { currentWeekCount: number }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info')
  const [showConfirm, setShowConfirm] = useState(false)

  const canSend = currentWeekCount >= 40

  async function handlePreview() {
    window.open('/api/admin/send-weekly-digest?preview=true', '_blank')
  }

  async function handleSendTest() {
    const email = prompt('Enter email address for test digest:')
    if (!email) return

    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/send-weekly-digest?test=${encodeURIComponent(email)}`, {
        method: 'POST',
      })
      const data = await res.json()
      setMessage(data.message || data.error)
      setMessageType(res.ok ? 'success' : 'error')
    } catch {
      setMessage('Network error.')
      setMessageType('error')
    } finally {
      setLoading(false)
    }
  }

  async function handleSendAll() {
    setShowConfirm(false)
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/send-weekly-digest', { method: 'POST' })
      const data = await res.json()
      setMessage(data.message || data.error)
      setMessageType(res.ok ? 'success' : 'error')
    } catch {
      setMessage('Network error.')
      setMessageType('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-card p-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-[#3ea8c8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Weekly Production Digest Email
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {canSend ? (
              <>Current week has <strong className="text-green-600">{currentWeekCount}</strong> productions — ready to send.</>
            ) : (
              <>Current week has <strong className="text-amber-600">{currentWeekCount}</strong> productions — needs 40+ to send.</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePreview}
            className="btn-outline text-sm py-1.5 px-3"
          >
            Preview
          </button>
          <button
            onClick={handleSendTest}
            disabled={loading}
            className="btn-outline text-sm py-1.5 px-3"
          >
            Send Test
          </button>
          {showConfirm ? (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <span className="text-sm text-red-700 font-medium">Send to all members?</span>
              <button
                onClick={handleSendAll}
                disabled={loading}
                className="text-sm bg-red-600 text-white px-3 py-1 rounded font-medium hover:bg-red-700"
              >
                Yes, Send
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={loading || !canSend}
              className="btn-primary text-sm py-1.5 px-4 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending…
                </>
              ) : (
                'Send to All Members'
              )}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`mt-3 text-sm px-3 py-2 rounded-lg ${
          messageType === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
          messageType === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
          'bg-blue-50 text-blue-700 border border-blue-200'
        }`}>
          {message}
        </div>
      )}
    </div>
  )
}
