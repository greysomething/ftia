'use client'

import { useState, useEffect } from 'react'

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

export default function PopupSettingsPage() {
  const [settings, setSettings] = useState<PopupSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/popup-settings')
      .then(r => r.json())
      .then(s => setSettings(s))
      .catch(() => setError('Failed to load settings'))
  }, [])

  async function handleSave() {
    if (!settings) return
    setSaving(true)
    setSaved(false)
    setError('')

    try {
      const res = await fetch('/api/admin/popup-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to save')
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Popup Settings</h1>
          <p className="text-gray-500 mt-1">
            Configure the email sign-up popup that appears for non-members
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Enable / Disable */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Popup Status</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Enable or disable the email sign-up popup globally
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={e => setSettings({ ...settings, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent" />
            </label>
          </div>
        </div>

        {/* Trigger Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Trigger Mode</h2>

          <div className="space-y-3">
            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors"
              style={{ borderColor: settings.trigger === 'delay' ? '#009BDE' : '#e5e7eb', backgroundColor: settings.trigger === 'delay' ? '#f0f9ff' : '' }}
            >
              <input
                type="radio"
                name="trigger"
                value="delay"
                checked={settings.trigger === 'delay'}
                onChange={() => setSettings({ ...settings, trigger: 'delay' })}
                className="mt-0.5 accent-accent"
              />
              <div>
                <span className="font-medium text-gray-900">Time Delay</span>
                <p className="text-sm text-gray-500">Show popup after a set number of seconds on the page</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors"
              style={{ borderColor: settings.trigger === 'pagecount' ? '#009BDE' : '#e5e7eb', backgroundColor: settings.trigger === 'pagecount' ? '#f0f9ff' : '' }}
            >
              <input
                type="radio"
                name="trigger"
                value="pagecount"
                checked={settings.trigger === 'pagecount'}
                onChange={() => setSettings({ ...settings, trigger: 'pagecount' })}
                className="mt-0.5 accent-accent"
              />
              <div>
                <span className="font-medium text-gray-900">Page Count</span>
                <p className="text-sm text-gray-500">Show popup after the visitor views a certain number of pages</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors"
              style={{ borderColor: settings.trigger === 'exit_intent' ? '#009BDE' : '#e5e7eb', backgroundColor: settings.trigger === 'exit_intent' ? '#f0f9ff' : '' }}
            >
              <input
                type="radio"
                name="trigger"
                value="exit_intent"
                checked={settings.trigger === 'exit_intent'}
                onChange={() => setSettings({ ...settings, trigger: 'exit_intent' })}
                className="mt-0.5 accent-accent"
              />
              <div>
                <span className="font-medium text-gray-900">Exit Intent</span>
                <p className="text-sm text-gray-500">Show popup when the visitor moves their mouse toward the browser&apos;s close/back button</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors"
              style={{ borderColor: settings.trigger === 'combined' ? '#009BDE' : '#e5e7eb', backgroundColor: settings.trigger === 'combined' ? '#f0f9ff' : '' }}
            >
              <input
                type="radio"
                name="trigger"
                value="combined"
                checked={settings.trigger === 'combined'}
                onChange={() => setSettings({ ...settings, trigger: 'combined' })}
                className="mt-0.5 accent-accent"
              />
              <div>
                <span className="font-medium text-gray-900">Combined (Any)</span>
                <p className="text-sm text-gray-500">Show popup when any of the above conditions are met (whichever fires first)</p>
              </div>
            </label>
          </div>
        </div>

        {/* Trigger Parameters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Trigger Parameters</h2>

          <div className="grid grid-cols-2 gap-6">
            {/* Delay seconds */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time Delay (seconds)
              </label>
              <input
                type="number"
                min={1}
                max={300}
                value={settings.delaySeconds}
                onChange={e => setSettings({ ...settings, delaySeconds: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-accent focus:border-accent outline-none"
                disabled={settings.trigger === 'pagecount' || settings.trigger === 'exit_intent'}
              />
              <p className="text-xs text-gray-500 mt-1">
                Used for &quot;Time Delay&quot; and &quot;Combined&quot; modes
              </p>
            </div>

            {/* Page count */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pages Before Popup
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={settings.pageCount}
                onChange={e => setSettings({ ...settings, pageCount: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-accent focus:border-accent outline-none"
                disabled={settings.trigger === 'delay' || settings.trigger === 'exit_intent'}
              />
              <p className="text-xs text-gray-500 mt-1">
                Used for &quot;Page Count&quot; and &quot;Combined&quot; modes
              </p>
            </div>

            {/* Exit intent checkbox (for combined mode) */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.exitIntentEnabled}
                  onChange={e => setSettings({ ...settings, exitIntentEnabled: e.target.checked })}
                  className="w-4 h-4 accent-accent rounded"
                  disabled={settings.trigger !== 'combined'}
                />
                <span className="text-sm font-medium text-gray-700">
                  Enable exit intent (combined mode)
                </span>
              </label>
            </div>

            {/* Dismiss duration */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Don&apos;t show again for (days)
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={settings.dismissDurationDays}
                onChange={e => setSettings({ ...settings, dismissDurationDays: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-accent focus:border-accent outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                After dismissing, wait this many days before showing again
              </p>
            </div>
          </div>
        </div>

        {/* Visibility */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Visibility</h2>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.hideForLoggedIn}
              onChange={e => setSettings({ ...settings, hideForLoggedIn: e.target.checked })}
              className="w-4 h-4 accent-accent rounded"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Hide for logged-in users</span>
              <p className="text-sm text-gray-500">
                Don&apos;t show the popup to users who are already logged in
              </p>
            </div>
          </label>
        </div>

        {/* Content Customization */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Popup Content</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Heading</label>
              <input
                type="text"
                value={settings.heading}
                onChange={e => setSettings({ ...settings, heading: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-accent focus:border-accent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subheading</label>
              <textarea
                value={settings.subheading}
                onChange={e => setSettings({ ...settings, subheading: e.target.value })}
                rows={3}
                className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-accent focus:border-accent outline-none resize-vertical"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CTA Button Text</label>
              <input
                type="text"
                value={settings.ctaText}
                onChange={e => setSettings({ ...settings, ctaText: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-accent focus:border-accent outline-none"
              />
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-accent text-white font-medium px-8 py-2.5 rounded-md hover:bg-accent-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>

          {saved && (
            <span className="text-green-600 text-sm font-medium flex items-center gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Settings saved
            </span>
          )}

          {error && (
            <span className="text-red-500 text-sm">{error}</span>
          )}
        </div>
      </div>
    </div>
  )
}
