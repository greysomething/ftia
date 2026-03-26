'use client'

import { useState } from 'react'

type Step = 'form' | 'confirm' | 'success'

export default function UnsubscribeClient() {
  const [step, setStep] = useState<Step>('form')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleUnsubscribe() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const data = await res.json()
      if (res.ok) {
        setStep('success')
      } else {
        setError(data.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'success') {
    return (
      <div className="max-w-lg mx-auto py-20 px-4 text-center">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">You&apos;ve Been Unsubscribed</h1>
          <p className="text-gray-600 mb-6">
            <strong>{email}</strong> has been removed from our mailing lists.
            You will no longer receive marketing emails from Production List.
          </p>
          <p className="text-sm text-gray-400 mb-6">
            You may still receive transactional emails related to your account
            (password resets, membership confirmations, etc.)
          </p>
          <div className="flex gap-3 justify-center">
            <a
              href="/"
              className="inline-block bg-[#1B2A4A] text-white font-semibold px-6 py-3 rounded-lg hover:bg-[#2a3d66] transition-colors"
            >
              Back to Home
            </a>
            <a
              href="/membership-plans"
              className="inline-block border border-gray-300 text-gray-700 font-semibold px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              View Plans
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="max-w-lg mx-auto py-20 px-4 text-center">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-3">Are You Sure?</h1>
          <p className="text-gray-600 mb-4">
            By unsubscribing, you&apos;ll miss out on:
          </p>

          <ul className="text-left text-gray-700 space-y-3 mb-6 max-w-sm mx-auto">
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span><strong>Weekly Production Digest</strong> — the most up-to-date list of film &amp; TV productions in pre-production across North America</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span><strong>New production alerts</strong> — be the first to know about upcoming projects looking for crew and vendors</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span><strong>Industry updates</strong> — important news, Do Not Work notices, and opportunities in the entertainment industry</span>
            </li>
          </ul>

          <p className="text-sm text-gray-500 mb-6">
            Unsubscribing for <strong>{email}</strong>
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 mb-4">
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setStep('form')}
              disabled={loading}
              className="border border-gray-300 text-gray-700 font-semibold px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Keep Me Subscribed
            </button>
            <button
              onClick={handleUnsubscribe}
              disabled={loading}
              className="bg-red-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Processing...
                </>
              ) : (
                'Yes, Unsubscribe Me'
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Step: form
  return (
    <div className="max-w-lg mx-auto py-20 px-4 text-center">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">Unsubscribe from Emails</h1>
        <p className="text-gray-600 mb-6">
          Enter your email address below to unsubscribe from Production List marketing emails.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (email.trim() && email.includes('@')) {
              setStep('confirm')
            }
          }}
          className="space-y-4"
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email address"
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#43B7F0] focus:border-transparent outline-none text-center"
          />
          <button
            type="submit"
            disabled={!email.trim() || !email.includes('@')}
            className="w-full bg-[#1B2A4A] text-white font-semibold px-6 py-3 rounded-lg hover:bg-[#2a3d66] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </form>

        <p className="text-sm text-gray-400 mt-6">
          Changed your mind? Simply close this page to stay subscribed.
        </p>
      </div>
    </div>
  )
}
