'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
}

export function RegisterForm({ plan, levelId }: RegisterFormProps) {
  const isFree = plan === 'free'
  const [step, setStep] = useState<'account' | 'profile'>('account')
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    organizationName: '',
    organizationType: '',
    country: '',
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

    // For free plan step 1, move to profile step
    if (isFree && step === 'account') {
      if (!form.email || !form.password || !form.firstName) {
        setError('Please fill in all required fields.')
        setLoading(false)
        return
      }
      setStep('profile')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: `${form.firstName} ${form.lastName}`.trim(),
          first_name: form.firstName,
          last_name: form.lastName,
        },
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Update profile with additional fields
    if (data.user) {
      await (supabase.from as any)('user_profiles').upsert({
        id: data.user.id,
        first_name: form.firstName,
        last_name: form.lastName,
        display_name: `${form.firstName} ${form.lastName}`.trim(),
        organization_name: form.organizationName,
        organization_type: form.organizationType,
        country: form.country,
        description: form.bio,
        linkedin: form.linkedin,
        website: form.website,
      })
    }

    // Redirect based on plan type
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

      {/* Step indicator for free plan */}
      {isFree && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-1">
            <div className="w-6 h-6 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</div>
            <div className={`flex-1 h-1 rounded-full ${step === 'profile' ? 'bg-accent' : 'bg-gray-200'}`} />
          </div>
          <div className="flex items-center gap-1.5 flex-1">
            <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${step === 'profile' ? 'bg-accent text-white' : 'bg-gray-200 text-gray-500'}`}>2</div>
            <div className="flex-1 h-1 rounded-full bg-gray-200" />
          </div>
        </div>
      )}

      {step === 'account' ? (
        <>
          {/* Account fields */}
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

          <div>
            <label className="form-label">Password <span className="text-red-400">*</span></label>
            <input
              type="password" required className="form-input" minLength={8}
              value={form.password} onChange={(e) => update('password', e.target.value)}
              autoComplete="new-password"
            />
            <p className="text-xs text-gray-400 mt-1">Minimum 8 characters</p>
          </div>

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
            {loading ? 'Please wait…' : isFree ? 'Continue — Set Up Profile →' : 'Create Account'}
          </button>
        </>
      ) : (
        <>
          {/* Profile step (free plan only) */}
          <div className="text-center mb-2">
            <h3 className="font-semibold text-gray-900">Set Up Your Profile</h3>
            <p className="text-xs text-gray-500">Help others in the industry find and connect with you</p>
          </div>

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
            <label className="form-label">Short Bio</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={form.bio} onChange={(e) => update('bio', e.target.value)}
              placeholder="Brief description of your work in the industry"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">LinkedIn</label>
              <input
                type="url" className="form-input"
                value={form.linkedin} onChange={(e) => update('linkedin', e.target.value)}
                placeholder="linkedin.com/in/…"
              />
            </div>
            <div>
              <label className="form-label">Website</label>
              <input
                type="url" className="form-input"
                value={form.website} onChange={(e) => update('website', e.target.value)}
                placeholder="yoursite.com"
              />
            </div>
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

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep('account')}
              className="btn-outline flex-shrink-0"
            >
              ← Back
            </button>
            <button type="submit" disabled={loading} className="btn-accent w-full justify-center">
              {loading ? 'Creating your profile…' : 'Create My Free Profile'}
            </button>
          </div>

          <p className="text-center">
            <button
              type="submit"
              disabled={loading}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors bg-transparent border-none cursor-pointer"
            >
              Skip for now — I&apos;ll complete my profile later
            </button>
          </p>
        </>
      )}
    </form>
  )
}
