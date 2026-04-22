'use client'

import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react'
import { usePathname } from 'next/navigation'

// Pages where the popup should never appear — auth flows interrupt the user
// experience the popup is designed to capture.
const EXCLUDED_PATH_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/checkout',
  '/membership-account',
  '/admin',
]

// ─── Industry Roles ──────────────────────────────────────────
const INDUSTRY_ROLES = [
  'Actor / Talent',
  'Art Department',
  'Camera / Cinematography',
  'Casting',
  'Costume / Wardrobe',
  'Director',
  'Editor / Post-Production',
  'Grip / Electric',
  'Hair & Make-Up',
  'Locations',
  'Music / Composer',
  'Producer',
  'Production Assistant',
  'Production Coordinator',
  'Production Manager / UPM',
  'Script Supervisor',
  'Set Design / Construction',
  'Sound / Audio',
  'Special Effects / SFX',
  'Stunts',
  'Transportation',
  'Visual Effects / VFX',
  'Writer',
  'Other',
]

const COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Australia',
  'New Zealand',
  'Europe',
  'Asia',
  'Latin America',
  'Africa',
  'Middle East',
  'Other',
]

interface PopupSettings {
  enabled: boolean
  trigger: 'delay' | 'pagecount' | 'exit_intent' | 'combined'
  delaySeconds: number
  pageCount: number
  exitIntentEnabled: boolean
  dismissDurationDays: number
  hideForLoggedIn: boolean
  heading: string
  subheading: string
  ctaText: string
}

const DISMISS_COOKIE = 'email_popup_dismissed'
const PAGE_COUNT_KEY = 'email_popup_page_count'

export function EmailPopup({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const [settings, setSettings] = useState<PopupSettings | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedData, setSubmittedData] = useState<{ name: string; email: string; role: string; country: string } | null>(null)
  const [error, setError] = useState('')
  const hasTriggered = useRef(false)
  const pathname = usePathname()
  const isExcludedPath = EXCLUDED_PATH_PREFIXES.some(p => pathname?.startsWith(p))

  // Fetch popup settings
  useEffect(() => {
    fetch('/api/popup-settings')
      .then(r => r.json())
      .then(s => setSettings(s))
      .catch(() => {})
  }, [])

  // Check if popup should show
  const shouldShow = useCallback(() => {
    if (!settings?.enabled) return false
    if (settings.hideForLoggedIn && isLoggedIn) return false
    if (isExcludedPath) return false
    if (hasTriggered.current) return false

    // Check dismiss cookie
    const cookies = document.cookie.split('; ')
    const dismissed = cookies.find(c => c.startsWith(DISMISS_COOKIE + '='))
    if (dismissed) return false

    return true
  }, [settings, isLoggedIn, isExcludedPath])

  const showPopup = useCallback(() => {
    if (!shouldShow()) return
    hasTriggered.current = true
    setIsOpen(true)
  }, [shouldShow])

  // Time delay trigger
  useEffect(() => {
    if (!settings) return
    if (settings.trigger !== 'delay' && settings.trigger !== 'combined') return
    if (!shouldShow()) return

    const timer = setTimeout(showPopup, settings.delaySeconds * 1000)
    return () => clearTimeout(timer)
  }, [settings, shouldShow, showPopup])

  // Page count trigger
  useEffect(() => {
    if (!settings) return
    if (settings.trigger !== 'pagecount' && settings.trigger !== 'combined') return
    if (!shouldShow()) return

    const count = Number(sessionStorage.getItem(PAGE_COUNT_KEY) || '0') + 1
    sessionStorage.setItem(PAGE_COUNT_KEY, String(count))

    if (count >= settings.pageCount) {
      showPopup()
    }
  }, [settings, shouldShow, showPopup])

  // External trigger — other components can dispatch 'open-email-popup' to open
  useEffect(() => {
    function handleOpenEvent() {
      setIsOpen(true)
    }
    window.addEventListener('open-email-popup', handleOpenEvent)
    return () => window.removeEventListener('open-email-popup', handleOpenEvent)
  }, [])

  // Exit intent trigger
  useEffect(() => {
    if (!settings) return
    if (settings.trigger !== 'exit_intent' && settings.trigger !== 'combined') return
    if (!settings.exitIntentEnabled && settings.trigger === 'combined') return
    if (!shouldShow()) return

    function handleMouseLeave(e: MouseEvent) {
      if (e.clientY <= 0) {
        showPopup()
      }
    }

    document.addEventListener('mouseleave', handleMouseLeave)
    return () => document.removeEventListener('mouseleave', handleMouseLeave)
  }, [settings, shouldShow, showPopup])

  function dismiss() {
    setIsOpen(false)
    // Set cookie to not show again for N days
    const days = settings?.dismissDurationDays ?? 7
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString()
    document.cookie = `${DISMISS_COOKIE}=1; expires=${expires}; path=/`
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const form = e.currentTarget
    const data = {
      name: (form.elements.namedItem('name') as HTMLInputElement).value.trim(),
      email: (form.elements.namedItem('email') as HTMLInputElement).value.trim(),
      role: (form.elements.namedItem('role') as HTMLSelectElement).value,
      country: (form.elements.namedItem('country') as HTMLSelectElement).value,
    }

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Something went wrong.')
      }

      setSubmitted(true)
      setSubmittedData(data)
      // Set dismiss cookie so popup doesn't show again
      const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString()
      document.cookie = `${DISMISS_COOKIE}=1; expires=${expires}; path=/`
    } catch (err: any) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen || !settings) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Email Sign Up"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={dismiss} aria-hidden="true" />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          type="button"
          onClick={dismiss}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Blue accent bar */}
        <div className="h-1.5 bg-accent rounded-t-lg" />

        <div className="px-8 pt-6 pb-6">
          {submitted ? (
            /* Success state — choose free profile or full access */
            <div className="py-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-1">Welcome to Production List!</h2>
              <p className="text-gray-500 text-center text-sm mb-6">
                Choose how you&apos;d like to get started
              </p>

              {/* Option 1: Free Profile — pass popup data to pre-fill register form */}
              <a
                href={`/register?plan=free${submittedData ? `&name=${encodeURIComponent(submittedData.name)}&email=${encodeURIComponent(submittedData.email)}&role=${encodeURIComponent(submittedData.role)}&country=${encodeURIComponent(submittedData.country)}` : ''}`}
                className="block w-full border-2 border-gray-200 rounded-lg p-4 mb-3 hover:border-accent hover:bg-accent/5 transition-all group !text-inherit"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-accent/10 flex items-center justify-center flex-shrink-0 transition-colors">
                    <svg className="w-5 h-5 text-gray-500 group-hover:text-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">Create Free Profile</span>
                      <span className="text-xs font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded">FREE</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Set up your industry profile, browse productions &amp; read news
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 group-hover:text-accent flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </a>

              {/* Option 2: Full Access */}
              <a
                href="/membership-plans"
                className="block w-full border-2 border-accent bg-accent/5 rounded-lg p-4 hover:bg-accent/10 transition-all group !text-inherit"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-accent">Get Full Access</span>
                      <span className="text-xs font-medium bg-accent/10 text-accent px-1.5 py-0.5 rounded">PRO</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Contacts, crew details, weekly lists &amp; exclusive data — from $38.95/mo
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </a>

              <p className="text-xs text-gray-400 text-center mt-4">
                You can upgrade anytime. Check your email for account details.
              </p>
            </div>
          ) : (
            <>
              {/* Heading */}
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-1">
                {settings.heading}
              </h2>
              <p className="text-gray-600 text-center text-sm mb-5">
                {settings.subheading}
              </p>

              {/* Features list */}
              <div className="bg-gray-50 rounded-lg p-4 mb-5">
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Weekly updated production lists with full contact details</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Search 10,000+ active film &amp; TV productions in pre-production</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Find projects filming near you with crew &amp; cast information</span>
                  </li>
                </ul>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Name */}
                <div>
                  <label htmlFor="popup-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="popup-name"
                    name="name"
                    type="text"
                    required
                    placeholder="Full Name"
                    className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-accent focus:border-accent outline-none"
                  />
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="popup-email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="popup-email"
                    name="email"
                    type="email"
                    required
                    placeholder="Email Address"
                    className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-accent focus:border-accent outline-none"
                  />
                </div>

                {/* Industry Role + Country */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="popup-role" className="block text-sm font-medium text-gray-700 mb-1">
                      Industry Role <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="popup-role"
                      name="role"
                      required
                      defaultValue=""
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-gray-900 bg-white focus:ring-2 focus:ring-accent focus:border-accent outline-none appearance-none"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 0.5rem center',
                        backgroundSize: '1.25rem',
                        paddingRight: '2rem',
                      }}
                    >
                      <option value="" disabled hidden>Select...</option>
                      {INDUSTRY_ROLES.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="popup-country" className="block text-sm font-medium text-gray-700 mb-1">
                      Country/Zone <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="popup-country"
                      name="country"
                      required
                      defaultValue=""
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-gray-900 bg-white focus:ring-2 focus:ring-accent focus:border-accent outline-none appearance-none"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 0.5rem center',
                        backgroundSize: '1.25rem',
                        paddingRight: '2rem',
                      }}
                    >
                      <option value="" disabled hidden>Select...</option>
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <p className="text-red-500 text-sm text-center">{error}</p>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-accent text-white font-semibold px-8 py-3 rounded-md hover:bg-accent-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-base"
                >
                  {submitting ? 'Submitting...' : settings.ctaText}
                </button>
              </form>

              {/* Already a member */}
              <p className="text-center text-sm text-gray-500 mt-3">
                Already a member?{' '}
                <a href="/login" className="text-accent hover:underline font-medium">
                  Log in
                </a>
              </p>
            </>
          )}
        </div>

        {/* Footer trust badge */}
        <div className="border-t border-gray-100 px-8 py-3">
          <p className="text-xs text-gray-500 text-center">
            Film &amp; Television Industry Alliance is dedicated to keeping your personal information safe.
          </p>
        </div>
      </div>
    </div>
  )
}
