'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function RegisterForm() {
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    organizationName: '',
    organizationType: '',
    country: '',
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
      })
    }

    router.push('/membership-account/membership-levels')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">First Name</label>
          <input
            type="text" required className="form-input"
            value={form.firstName} onChange={(e) => update('firstName', e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">Last Name</label>
          <input
            type="text" required className="form-input"
            value={form.lastName} onChange={(e) => update('lastName', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="form-label">Email Address</label>
        <input
          type="email" required className="form-input"
          value={form.email} onChange={(e) => update('email', e.target.value)}
          autoComplete="email"
        />
      </div>

      <div>
        <label className="form-label">Password</label>
        <input
          type="password" required className="form-input" minLength={8}
          value={form.password} onChange={(e) => update('password', e.target.value)}
          autoComplete="new-password"
        />
        <p className="text-xs text-gray-400 mt-1">Minimum 8 characters</p>
      </div>

      <div>
        <label className="form-label">Organization / Company Name</label>
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

      <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
        {loading ? 'Creating account…' : 'Create Account'}
      </button>
    </form>
  )
}
