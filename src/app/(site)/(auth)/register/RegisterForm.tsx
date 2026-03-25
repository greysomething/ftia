'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// NOTE: Registration now goes through /api/auth/register which creates the
// user server-side via the admin client, upserts the profile, sends a branded
// welcome email via Resend, and adds the user to the newsletter audience.
// After the API call succeeds we sign in client-side so the session cookie is set.

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

interface RegisterFormProps {
  plan?: 'free'
  levelId?: string
  prefill?: { name?: string; email?: string; role?: string; country?: string }
}

export function RegisterForm({ plan, levelId, prefill }: RegisterFormProps) {
  const isFree = plan === 'free'
  const nameParts = (prefill?.name ?? '').trim().split(/\s+/)
  const prefillFirst = nameParts[0] ?? ''
  const prefillLast = nameParts.slice(1).join(' ')

  // Step 1 = profile info, Step 2 = password & create account
  const [step, setStep] = useState<'profile' | 'account'>('profile')
  const [form, setForm] = useState({
    email: prefill?.email ?? '',
    password: '',
    firstName: prefillFirst,
    lastName: prefillLast,
    organizationName: '',
    organizationType: prefill?.role ?? '',
    country: prefill?.country ?? '',
    bio: '',
    linkedin: '',
    website: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function update(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Step 1 (profile) → validate and move to step 2
    if (step === 'profile') {
      if (!form.firstName.trim()) {
        setError('First name is required.')
        setLoading(false)
        return
      }
      if (!form.email.trim()) {
        setError('Email address is required.')
        setLoading(false)
        return
      }
      setError(null)
      setStep('account')
      setLoading(false)
      return
    }

    // Step 2 (account) or single-step for paid → create account
    if (!form.password || form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      setLoading(false)
      return
    }

    // Call server-side registration API (creates user, upserts profile,
    // sends welcome email, adds to Resend audience)
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        organizationName: form.organizationName,
        organizationType: form.organizationType,
        country: form.country,
        bio: form.bio,
        linkedin: form.linkedin,
        website: form.website,
      }),
    })

    const result = await res.json()

    if (!res.ok || result.error) {
      setError(result.error ?? 'Registration failed. Please try again.')
      setLoading(false)
      return
    }

    // Sign in client-side so the session cookie is set
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })

    if (signInError) {
      // User was created but auto-sign-in failed — send them to login
      router.push('/login?registered=true')
      return
    }

    if (isFree) {
      router.push('/welcome')
    } else if (levelId) {
      router.push(`/membership-account/membership-checkout?level=${levelId}`)
    } else {
      router.push('/membership-plans')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-1">
          <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${
            step === 'profile' ? 'bg-accent text-white' : 'bg-accent text-white'
          }`}>1</div>
          <div className={`flex-1 h-1 rounded-full ${step === 'account' ? 'bg-accent' : 'bg-gray-200'}`} />
        </div>
        <div className="flex items-center gap-1.5 flex-1">
          <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${
            step === 'account' ? 'bg-accent text-white' : 'bg-gray-200 text-gray-500'
          }`}>2</div>
          <div className="flex-1 h-1 rounded-full bg-gray-200" />
        </div>
      </div>

      {step === 'profile' ? (
        <>
          {/* Step 1: Profile info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">First Name <span className="text-red-400">*</span></label>
              <input
                type="text" required className="form-input"
                value={form.firstName} onChange={(e) => update('firstName', e.target.value)}
                placeholder="Jane"
              />
            </div>
            <div>
              <label className="form-label">Last Name</label>
              <input
                type="text" className="form-input"
                value={form.lastName} onChange={(e) => update('lastName', e.target.value)}
                placeholder="Smith"
              />
            </div>
          </div>

          <div>
            <label className="form-label">Email Address <span className="text-red-400">*</span></label>
            <input
              type="email" required className="form-input"
              value={form.email} onChange={(e) => update('email', e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>

          {isFree && (
            <>
              <div>
                <label className="form-label">Industry Role <span className="text-red-400">*</span></label>
                <select
                  required className="form-input"
                  value={form.organizationType} onChange={(e) => update('organizationType', e.target.value)}
                >
                  <option value="" disabled>Select your role…</option>
                  {INDUSTRY_ROLES.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Organization / Company</label>
                <input
                  type="text" className="form-input"
                  value={form.organizationName} onChange={(e) => update('organizationName', e.target.value)}
                  placeholder="Production company, studio, agency…"
                />
              </div>

              <div>
                <label className="form-label">Country</label>
                <select className="form-input" value={form.country} onChange={(e) => update('country', e.target.value)}>
                  <option value="">Select country</option>
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                  <option value="GB">United Kingdom</option>
                  <option value="AU">Australia</option>
                  <option value="NZ">New Zealand</option>
                  <option value="IE">Ireland</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </>
          )}

          {!isFree && (
            <>
              <div>
                <label className="form-label">Organization / Company</label>
                <input
                  type="text" className="form-input"
                  value={form.organizationName} onChange={(e) => update('organizationName', e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="form-label">Your Role / Job Title</label>
                <input
                  type="text" className="form-input"
                  value={form.organizationType} onChange={(e) => update('organizationType', e.target.value)}
                  placeholder="e.g. Producer, Director, Writer"
                />
              </div>
              <div>
                <label className="form-label">Country</label>
                <select className="form-input" value={form.country} onChange={(e) => update('country', e.target.value)}>
                  <option value="">Select country</option>
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                  <option value="GB">United Kingdom</option>
                  <option value="AU">Australia</option>
                  <option value="NZ">New Zealand</option>
                  <option value="IE">Ireland</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading ? 'Please wait…' : isFree ? 'Continue — Set Password →' : 'Continue →'}
          </button>
        </>
      ) : (
        <>
          {/* Step 2: Password & create account */}
          <div className="text-center mb-2">
            <h3 className="font-semibold text-gray-900">Almost Done!</h3>
            <p className="text-xs text-gray-500">Set a password to secure your account</p>
          </div>

          {/* Show summary of what they entered */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Name</span>
              <span className="font-medium text-gray-800">{form.firstName} {form.lastName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Email</span>
              <span className="font-medium text-gray-800">{form.email}</span>
            </div>
            {form.organizationType && (
              <div className="flex justify-between">
                <span className="text-gray-500">Role</span>
                <span className="font-medium text-gray-800">{form.organizationType}</span>
              </div>
            )}
          </div>

          <div>
            <label className="form-label">Password <span className="text-red-400">*</span></label>
            <input
              type="password" required className="form-input" minLength={8}
              value={form.password} onChange={(e) => update('password', e.target.value)}
              autoComplete="new-password"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">Minimum 8 characters</p>
          </div>

          {isFree && (
            <>
              <div>
                <label className="form-label">Short Bio <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={form.bio} onChange={(e) => update('bio', e.target.value)}
                  placeholder="Brief description of your work in the industry"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">LinkedIn <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input
                    type="url" className="form-input"
                    value={form.linkedin} onChange={(e) => update('linkedin', e.target.value)}
                    placeholder="linkedin.com/in/…"
                  />
                </div>
                <div>
                  <label className="form-label">Website <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input
                    type="url" className="form-input"
                    value={form.website} onChange={(e) => update('website', e.target.value)}
                    placeholder="yoursite.com"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setStep('profile'); setError(null) }}
              className="btn-outline flex-shrink-0"
            >
              ← Back
            </button>
            <button type="submit" disabled={loading} className="btn-accent w-full justify-center">
              {loading ? 'Creating your account…' : isFree ? 'Create My Free Profile' : 'Create Account & Continue →'}
            </button>
          </div>
        </>
      )}
    </form>
  )
}
