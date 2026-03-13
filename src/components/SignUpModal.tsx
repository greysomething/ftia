'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
  type FormEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

// ─── Context ────────────────────────────────────────────────
interface SignUpModalContextValue {
  open: () => void
}

const SignUpModalContext = createContext<SignUpModalContextValue>({
  open: () => {},
})

export function useSignUpModal() {
  return useContext(SignUpModalContext)
}

// ─── Provider (wraps the page) ──────────────────────────────
export function SignUpModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  return (
    <SignUpModalContext.Provider value={{ open }}>
      {children}
      {isOpen && <SignUpModal onClose={close} />}
    </SignUpModalContext.Provider>
  )
}

// ─── Trigger button (client-side onClick) ───────────────────
export function SignUpTriggerButton({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const { open } = useSignUpModal()
  return (
    <button type="button" onClick={open} className={className}>
      {children}
    </button>
  )
}

// ─── Industry Roles ─────────────────────────────────────────
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

// ─── Countries / Zones ──────────────────────────────────────
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

// ─── Modal ──────────────────────────────────────────────────
function SignUpModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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
        throw new Error(body.error || 'Something went wrong. Please try again.')
      }

      // Success — close modal and navigate to step 2
      onClose()
      router.push('/membership-plans')
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="New Member Sign-Up"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-[500px] max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="px-8 pt-8 pb-6">
          {/* FTIA Emblem */}
          <div className="flex justify-center mb-4">
            <Image
              src="/images/ftia-emblem.svg"
              alt="FTIA"
              width={80}
              height={80}
              className="rounded-full"
            />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-1">
            New Member Sign-Up
          </h2>
          <p className="text-gray-600 text-center text-sm mb-5">
            Complete registration to get instant access to productionlist.com
          </p>

          {/* Progress bar — Step 1 of 3 */}
          <div className="mb-6">
            <div className="w-full bg-gray-200 rounded h-3 overflow-hidden">
              <div
                className="h-full rounded"
                style={{ width: '33%', backgroundColor: '#80D4FF' }}
              />
            </div>
            <p className="text-xs text-white font-semibold mt-[-14px] ml-2 relative z-10"
               style={{ textShadow: '0 0 3px rgba(0,0,0,0.3)' }}
            >
              Step 1 of 3
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label htmlFor="signup-name" className="block text-sm font-medium text-gray-700 mb-1">
                Name: <span className="text-red-500">*</span>
              </label>
              <input
                id="signup-name"
                name="name"
                type="text"
                required
                placeholder="Full Name"
                className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-accent focus:border-accent outline-none"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email: <span className="text-red-500">*</span>
              </label>
              <input
                id="signup-email"
                name="email"
                type="email"
                required
                placeholder="Email"
                className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-accent focus:border-accent outline-none"
              />
            </div>

            {/* Industry Role + Country — side by side */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="signup-role" className="block text-sm font-medium text-gray-700 mb-1">
                  Industry Role: <span className="text-red-500">*</span>
                </label>
                <select
                  id="signup-role"
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
                  <option value="" disabled hidden></option>
                  {INDUSTRY_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="signup-country" className="block text-sm font-medium text-gray-700 mb-1">
                  Country/Zone: <span className="text-red-500">*</span>
                </label>
                <select
                  id="signup-country"
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
                  <option value="" disabled hidden></option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-red-500 text-sm text-center">{error}</p>
            )}

            {/* Submit */}
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="bg-accent text-white font-medium px-8 py-2.5 rounded-md hover:bg-accent-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting…' : 'Get Started'}
              </button>
            </div>
          </form>
        </div>

        {/* Footer / Trust badge */}
        <div className="border-t border-gray-100 px-8 py-4">
          <p className="text-xs text-gray-500 text-center">
            🔒 Film &amp; Television Industry Alliance is dedicated to keeping your personal information safe.
          </p>
        </div>
      </div>
    </div>
  )
}
