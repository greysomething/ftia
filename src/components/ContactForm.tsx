'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

export default function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Render Turnstile widget once the script loads
  function renderTurnstile() {
    if (!turnstileRef.current || !TURNSTILE_SITE_KEY) return
    if (widgetIdRef.current !== null) return // already rendered

    const win = window as any
    if (win.turnstile) {
      widgetIdRef.current = win.turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        theme: 'light',
      })
    }
  }

  // Reset widget after submission
  function resetTurnstile() {
    const win = window as any
    if (win.turnstile && widgetIdRef.current !== null) {
      win.turnstile.reset(widgetIdRef.current)
      setTurnstileToken('')
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')

    const form = e.currentTarget
    const formData = new FormData(form)

    // Add the Turnstile token
    formData.set('cf-turnstile-response', turnstileToken)

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (data.success) {
        setStatus('success')
        form.reset()
        resetTurnstile()
      } else {
        setStatus('error')
        setErrorMsg(data.error || 'Something went wrong. Please try again.')
        resetTurnstile()
      }
    } catch {
      setStatus('error')
      setErrorMsg('Something went wrong. Please try again.')
      resetTurnstile()
    }
  }

  return (
    <>
      {TURNSTILE_SITE_KEY && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          onReady={renderTurnstile}
        />
      )}

      {status === 'success' && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 mb-6 text-sm">
          Thank you for your message! We&apos;ll get back to you shortly.
        </div>
      )}
      {status === 'error' && errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6 text-sm">
          {errorMsg}
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        <div>
          <label htmlFor="name" className="form-label">Name</label>
          <input
            type="text"
            id="name"
            name="name"
            required
            className="form-input"
            placeholder="Your name"
          />
        </div>

        <div>
          <label htmlFor="email" className="form-label">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            required
            className="form-input"
            placeholder="your@email.com"
          />
        </div>

        <div>
          <label htmlFor="subject" className="form-label">Subject</label>
          <select id="subject" name="subject" className="form-input">
            <option value="general">General Inquiry</option>
            <option value="membership">Membership / Billing</option>
            <option value="data">Data / Production Listing</option>
            <option value="technical">Technical Support</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label htmlFor="message" className="form-label">Message</label>
          <textarea
            id="message"
            name="message"
            required
            rows={6}
            className="form-input"
            placeholder="How can we help?"
          />
        </div>

        {/* Honeypot — hidden from real users, bots fill it in */}
        <div className="absolute opacity-0 -z-10" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input
            type="text"
            id="website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        {/* Turnstile widget */}
        {TURNSTILE_SITE_KEY && (
          <div ref={turnstileRef} className="mb-2" />
        )}

        <button
          type="submit"
          disabled={status === 'submitting' || (!!TURNSTILE_SITE_KEY && !turnstileToken)}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'submitting' ? 'Sending...' : 'Send Message'}
        </button>

        {!!TURNSTILE_SITE_KEY && !turnstileToken && status === 'idle' && (
          <p className="text-xs text-gray-400 text-center">
            Complete the verification above to send your message
          </p>
        )}
      </form>
    </>
  )
}
