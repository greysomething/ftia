'use client'

/**
 * Auto-match settings card.
 *
 * Controls when the entity matcher (used by the AI Scanner and the
 * Production form) auto-links a scanned company/crew name to a database
 * record without admin confirmation. Stored in `site_settings` under
 * key='entity_match_settings'.
 *
 * Defaults: enabled at 95% — same as the matcher's hardcoded behavior
 * before this setting existed (well, that was 90; we raised the default
 * here to 95 to err on the safe side per user request).
 */

import { useEffect, useState } from 'react'

interface Settings {
  enabled: boolean
  auto_threshold: number
}

const DEFAULT: Settings = { enabled: true, auto_threshold: 95 }

export function MatchSettingsCard() {
  const [settings, setSettings] = useState<Settings>(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/match-settings')
      .then(r => r.json())
      .then((data: { settings: Settings }) => {
        if (data?.settings) setSettings(data.settings)
      })
      .catch(() => setFlash({ type: 'error', message: 'Failed to load match settings' }))
      .finally(() => setLoading(false))
  }, [])

  function showFlash(type: 'success' | 'error', message: string) {
    setFlash({ type, message })
    setTimeout(() => setFlash(null), 3000)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/match-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Save failed')
      }
      const { settings: saved } = await res.json()
      setSettings(saved)
      showFlash('success', 'Saved successfully')
    } catch (err: any) {
      showFlash('error', err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-card">
        <div className="animate-pulse h-24" />
      </div>
    )
  }

  return (
    <div className="admin-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Auto-Match Threshold</h2>
          <p className="text-sm text-gray-500 mt-1">
            When the matcher finds a database company or crew member with a
            confidence score at or above this percentage, link it automatically
            instead of asking the admin to click. Applies to both the AI Scanner
            and the Production form.
          </p>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full font-medium ${
            settings.enabled
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {settings.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {flash && (
        <div
          className={`mb-4 px-4 py-2 rounded text-sm ${
            flash.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {flash.message}
        </div>
      )}

      <div className="space-y-4">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={e => setSettings(s => ({ ...s, enabled: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 text-[#3ea8c8] focus:ring-[#3ea8c8]"
          />
          <span className="text-sm font-medium text-gray-700">
            Enable auto-matching for high-confidence candidates
          </span>
        </label>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Minimum match score to auto-accept ({settings.auto_threshold}%)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={50}
              max={100}
              step={1}
              value={settings.auto_threshold}
              onChange={e =>
                setSettings(s => ({ ...s, auto_threshold: Number(e.target.value) }))
              }
              disabled={!settings.enabled}
              className="flex-1 disabled:opacity-50"
            />
            <input
              type="number"
              min={50}
              max={100}
              step={1}
              value={settings.auto_threshold}
              onChange={e =>
                setSettings(s => ({
                  ...s,
                  auto_threshold: Math.min(100, Math.max(50, Number(e.target.value) || 50)),
                }))
              }
              disabled={!settings.enabled}
              className="w-20 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#3ea8c8] focus:border-[#3ea8c8] disabled:opacity-50 disabled:bg-gray-50"
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            <strong>Recommendation:</strong> 95% is high-confidence (exact-name
            or near-exact match). Lower to 90% to also auto-accept very close
            matches like &quot;Warner Bros. Pictures&quot; → &quot;Warner Bros&quot;.
            Below 85% the false-positive rate climbs quickly.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-sm"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => setSettings(DEFAULT)}
            disabled={saving}
            className="btn-outline text-sm"
          >
            Reset to Default (95%)
          </button>
        </div>
      </div>
    </div>
  )
}
