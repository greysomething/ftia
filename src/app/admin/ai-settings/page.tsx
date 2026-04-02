'use client'

import { useState, useEffect } from 'react'

interface PromptRow {
  id: number
  slug: string
  name: string
  system_prompt: string | null
  model: string | null
  max_tokens: number | null
  updated_at: string
}

interface PromptDefault {
  name: string
  prompt: string
  model: string
  max_tokens: number
}

interface CardState {
  system_prompt: string
  model: string
  max_tokens: string
}

export default function AISettingsPage() {
  const [rows, setRows] = useState<PromptRow[]>([])
  const [defaults, setDefaults] = useState<Record<string, PromptDefault>>({})
  const [edits, setEdits] = useState<Record<string, CardState>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [flash, setFlash] = useState<{ slug: string; type: 'success' | 'error'; message: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/ai-settings')
      .then(r => r.json())
      .then((data: { rows: PromptRow[]; defaults: Record<string, PromptDefault> }) => {
        setRows(data.rows)
        setDefaults(data.defaults)
        const initial: Record<string, CardState> = {}
        for (const row of data.rows) {
          const d = data.defaults[row.slug]
          initial[row.slug] = {
            system_prompt: row.system_prompt ?? d?.prompt ?? '',
            model: row.model ?? d?.model ?? '',
            max_tokens: row.max_tokens != null ? String(row.max_tokens) : String(d?.max_tokens ?? ''),
          }
        }
        // Also init cards for slugs that have defaults but no DB row yet
        for (const [slug, d] of Object.entries(data.defaults)) {
          if (!initial[slug]) {
            initial[slug] = {
              system_prompt: d.prompt,
              model: d.model,
              max_tokens: String(d.max_tokens),
            }
          }
        }
        setEdits(initial)
      })
      .catch(() => showFlash('', 'error', 'Failed to load settings'))
      .finally(() => setLoading(false))
  }, [])

  function showFlash(slug: string, type: 'success' | 'error', message: string) {
    setFlash({ slug, type, message })
    setTimeout(() => setFlash(null), 3000)
  }

  function updateField(slug: string, field: keyof CardState, value: string) {
    setEdits(prev => ({
      ...prev,
      [slug]: { ...prev[slug], [field]: value },
    }))
  }

  async function handleSave(slug: string) {
    const edit = edits[slug]
    if (!edit) return

    setSaving(prev => ({ ...prev, [slug]: true }))
    try {
      const d = defaults[slug]
      // Only store overrides — if the value matches the default, save null
      const promptChanged = edit.system_prompt.trim() !== (d?.prompt ?? '').trim()
      const modelChanged = edit.model.trim() !== (d?.model ?? '').trim()
      const tokensChanged = edit.max_tokens !== String(d?.max_tokens ?? '')

      const res = await fetch('/api/admin/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          name: d?.name || slug,
          system_prompt: promptChanged ? edit.system_prompt : null,
          model: modelChanged ? edit.model : null,
          max_tokens: tokensChanged && edit.max_tokens ? Number(edit.max_tokens) : null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to save')
      }

      const { data } = await res.json()
      setRows(prev => prev.map(r => (r.slug === slug ? data : r)))
      showFlash(slug, 'success', 'Saved successfully')
    } catch (err: any) {
      showFlash(slug, 'error', err.message)
    } finally {
      setSaving(prev => ({ ...prev, [slug]: false }))
    }
  }

  async function handleReset(slug: string) {
    setSaving(prev => ({ ...prev, [slug]: true }))
    try {
      const d = defaults[slug]
      const res = await fetch('/api/admin/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          name: d?.name || slug,
          system_prompt: null,
          model: null,
          max_tokens: null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to reset')
      }

      const { data } = await res.json()
      setRows(prev => prev.map(r => (r.slug === slug ? data : r)))
      setEdits(prev => ({
        ...prev,
        [slug]: {
          system_prompt: d?.prompt ?? '',
          model: d?.model ?? '',
          max_tokens: String(d?.max_tokens ?? ''),
        },
      }))
      showFlash(slug, 'success', 'Reset to defaults')
    } catch (err: any) {
      showFlash(slug, 'error', err.message)
    } finally {
      setSaving(prev => ({ ...prev, [slug]: false }))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3ea8c8]" />
      </div>
    )
  }

  const slugs = Object.keys(defaults)

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">AI Research Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure the system prompts, models, and token limits used for AI-powered research.
          Leave fields empty to use the built-in defaults.
        </p>
      </div>

      <div className="space-y-6">
        {slugs.map(slug => {
          const d = defaults[slug]
          const row = rows.find(r => r.slug === slug)
          const edit = edits[slug] ?? { system_prompt: '', model: '', max_tokens: '' }
          const hasOverride = row && (row.system_prompt || row.model || row.max_tokens)

          return (
            <div key={slug} className="admin-card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{d.name}</h2>
                  <p className="text-sm text-gray-500">
                    Slug: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{slug}</code>
                    {hasOverride && row?.updated_at && (
                      <span className="ml-3 text-xs text-gray-400">
                        Last updated: {new Date(row.updated_at).toLocaleString()}
                      </span>
                    )}
                  </p>
                </div>
                {hasOverride && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                    Customized
                  </span>
                )}
              </div>

              {flash?.slug === slug && (
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    System Prompt
                  </label>
                  <textarea
                    rows={16}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-[#3ea8c8] focus:border-[#3ea8c8]"
                    value={edit.system_prompt}
                    onChange={e => updateField(slug, 'system_prompt', e.target.value)}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Edit the prompt directly. Click &quot;Reset to Default&quot; to restore the original.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Model
                    </label>
                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#3ea8c8] focus:border-[#3ea8c8]"
                      value={edit.model}
                      onChange={e => updateField(slug, 'model', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Tokens
                    </label>
                    <input
                      type="number"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#3ea8c8] focus:border-[#3ea8c8]"
                      value={edit.max_tokens}
                      onChange={e => updateField(slug, 'max_tokens', e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => handleSave(slug)}
                    disabled={saving[slug]}
                    className="btn-primary text-sm"
                  >
                    {saving[slug] ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => handleReset(slug)}
                    disabled={saving[slug]}
                    className="btn-outline text-sm"
                  >
                    Reset to Default
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
