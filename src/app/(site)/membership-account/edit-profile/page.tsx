'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const COUNTRIES = [
  'United States', 'Canada', 'United Kingdom', 'Australia', 'New Zealand', 'Ireland', 'Other',
]

export default function EditProfilePage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    organization_name: '',
    organization_type: '',
    country: '',
    linkedin: '',
    website: '',
    description: '',
  })

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name, organization_name, organization_type, custommer_job, country, linkedin, website, description')
        .eq('id', user.id)
        .single()

      if (profile) {
        setForm({
          first_name: profile.first_name ?? '',
          last_name: profile.last_name ?? '',
          organization_name: profile.organization_name ?? '',
          organization_type: profile.organization_type ?? profile.custommer_job ?? '',
          country: profile.country ?? '',
          linkedin: profile.linkedin ?? '',
          website: profile.website ?? '',
          description: profile.description ?? '',
        })
      }
      setLoading(false)
    }
    loadProfile()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { error } = await supabase
      .from('user_profiles')
      .update({
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        organization_name: form.organization_name || null,
        organization_type: form.organization_type || null,
        country: form.country || null,
        linkedin: form.linkedin || null,
        website: form.website || null,
        description: form.description || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    setSaving(false)

    if (error) {
      setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' })
    } else {
      setMessage({ type: 'success', text: 'Profile updated successfully.' })
      setTimeout(() => router.push('/membership-account'), 1500)
    }
  }

  function handleChange(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return (
      <div className="page-wrap py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="lg:w-56 flex-shrink-0">
            <nav className="white-bg p-4 space-y-1">
              {[
                ['My Account', '/membership-account'],
                ['Billing', '/membership-account/membership-billing'],
                ['Cancel', '/membership-account/membership-cancel'],
                ['Membership Plans', '/membership-plans'],
                ['Invoice', '/membership-account/membership-invoice'],
              ].map(([label, href]) => (
                <Link key={href} href={href} className="block px-3 py-2 rounded text-sm text-gray-700 hover:bg-primary/10 hover:text-primary">
                  {label}
                </Link>
              ))}
            </nav>
          </aside>
          <div className="flex-1">
            <div className="white-bg p-6">
              <p className="text-gray-500">Loading profile...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-wrap py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="lg:w-56 flex-shrink-0">
          <nav className="white-bg p-4 space-y-1">
            {[
              ['My Account', '/membership-account'],
              ['Billing', '/membership-account/membership-billing'],
              ['Cancel', '/membership-account/membership-cancel'],
              ['Membership Plans', '/membership-plans'],
              ['Invoice', '/membership-account/membership-invoice'],
            ].map(([label, href]) => (
              <Link key={href} href={href} className="block px-3 py-2 rounded text-sm text-gray-700 hover:bg-primary/10 hover:text-primary">
                {label}
              </Link>
            ))}
          </nav>
        </aside>

        <div className="flex-1">
          <div className="white-bg p-6">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-primary">Edit Profile</h1>
              <Link href="/membership-account" className="text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </Link>
            </div>

            {message && (
              <div className={`mb-4 p-3 rounded text-sm ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-600 border border-red-200'
              }`}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">First Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={form.first_name}
                    onChange={e => handleChange('first_name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Last Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={form.last_name}
                    onChange={e => handleChange('last_name', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Job Title / Role</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.organization_type}
                  onChange={e => handleChange('organization_type', e.target.value)}
                  placeholder="e.g. Producer, Director, Cinematographer"
                />
              </div>

              <div>
                <label className="form-label">Organization / Company</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.organization_name}
                  onChange={e => handleChange('organization_name', e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">Country</label>
                <select
                  className="form-input"
                  value={form.country}
                  onChange={e => handleChange('country', e.target.value)}
                >
                  <option value="">Select country</option>
                  {COUNTRIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">LinkedIn URL</label>
                <input
                  type="url"
                  className="form-input"
                  value={form.linkedin}
                  onChange={e => handleChange('linkedin', e.target.value)}
                  placeholder="https://linkedin.com/in/..."
                />
              </div>

              <div>
                <label className="form-label">Website</label>
                <input
                  type="url"
                  className="form-input"
                  value={form.website}
                  onChange={e => handleChange('website', e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="form-label">Bio</label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={form.description}
                  onChange={e => handleChange('description', e.target.value)}
                  placeholder="Tell us a bit about yourself..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <Link href="/membership-account" className="btn-secondary">
                  Cancel
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
