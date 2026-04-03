'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Settings {
  enabled: string
  posts_per_day: string
  auto_publish: string
  min_production_data_score: string
  exclude_types: string
  batch_size: string
}

interface QueueItem {
  id: number
  production_id: number
  status: string
  blog_post_id: number | null
  error: string | null
  attempts: number
  created_at: string
  started_at: string | null
  completed_at: string | null
  productions: { id: number; title: string; computed_status: string | null }
}

interface QueueStats {
  pending: number
  generating: number
  completed: number
  failed: number
  skipped: number
  total: number
}

interface GenerationProgress {
  index: number
  productionId: number
  status: string
  blogPostId?: number
  title?: string
  error?: string
}

const DEFAULT_SETTINGS: Settings = {
  enabled: 'true',
  posts_per_day: '1.5',
  auto_publish: 'false',
  min_production_data_score: '3',
  exclude_types: '[]',
  batch_size: '2',
}

export function BlogGenerateWorkflow() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSaving] = useState(false)
  const [settingsFlash, setSettingsFlash] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const [queue, setQueue] = useState<QueueItem[]>([])
  const [stats, setStats] = useState<QueueStats>({ pending: 0, generating: 0, completed: 0, failed: 0, skipped: 0, total: 0 })
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueTab, setQueueTab] = useState<string>('all')

  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<GenerationProgress[]>([])

  const [populating, setPopulating] = useState(false)

  const [dbError, setDbError] = useState<string | null>(null)

  // Load settings
  useEffect(() => {
    fetch('/api/admin/ai-blog-settings')
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          setDbError(d.error)
        } else if (d.settings) {
          setSettings({ ...DEFAULT_SETTINGS, ...d.settings })
        }
      })
      .catch(() => flash('error', 'Failed to load settings'))
      .finally(() => setSettingsLoading(false))
  }, [])

  // Load queue
  const loadQueue = useCallback((status?: string) => {
    setQueueLoading(true)
    const params = status && status !== 'all' ? `?status=${status}` : ''
    fetch(`/api/admin/ai-blog-queue${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          setDbError(d.error)
        } else {
          setQueue(d.items ?? [])
          setStats(d.stats ?? { pending: 0, generating: 0, completed: 0, failed: 0, skipped: 0, total: 0 })
        }
      })
      .catch(() => {})
      .finally(() => setQueueLoading(false))
  }, [])

  useEffect(() => { loadQueue(queueTab) }, [queueTab, loadQueue])

  function flash(type: 'success' | 'error', msg: string) {
    setSettingsFlash({ type, msg })
    setTimeout(() => setSettingsFlash(null), 4000)
  }

  async function saveSettings() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/ai-blog-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('Failed to save')
      flash('success', 'Settings saved')
    } catch {
      flash('error', 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  async function handlePopulate() {
    setPopulating(true)
    try {
      const res = await fetch('/api/admin/ai-blog-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'populate' }),
      })
      const d = await res.json()
      if (d.ok) {
        flash('success', `Added ${d.added} productions to queue`)
        loadQueue(queueTab)
      } else {
        flash('error', d.error || 'Failed to populate')
      }
    } catch {
      flash('error', 'Failed to populate queue')
    } finally {
      setPopulating(false)
    }
  }

  async function handleRetryFailed() {
    const res = await fetch('/api/admin/ai-blog-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'retry-failed' }),
    })
    if ((await res.json()).ok) {
      flash('success', 'Failed items reset to pending')
      loadQueue(queueTab)
    }
  }

  async function handleClearCompleted() {
    const res = await fetch('/api/admin/ai-blog-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear-completed' }),
    })
    if ((await res.json()).ok) {
      flash('success', 'Completed items cleared')
      loadQueue(queueTab)
    }
  }

  async function handleGenerate(queueId?: number) {
    setGenerating(true)
    setProgress([])

    try {
      const res = await fetch('/api/admin/ai-blog-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(queueId ? { mode: 'single', queueId } : { mode: 'batch' }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        flash('error', d.error || 'Generation failed')
        setGenerating(false)
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        flash('error', 'No response stream')
        setGenerating(false)
        return
      }

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let currentEvent = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7)
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (currentEvent === 'progress') {
                setProgress(prev => {
                  const existing = prev.findIndex(p => p.index === data.index)
                  if (existing >= 0) {
                    const updated = [...prev]
                    updated[existing] = data
                    return updated
                  }
                  return [...prev, data]
                })
              }
            } catch {}
          }
        }
      }

      flash('success', 'Generation complete')
      loadQueue(queueTab)
    } catch (err: any) {
      flash('error', err.message || 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const TABS = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'pending', label: 'Pending', count: stats.pending },
    { key: 'generating', label: 'Generating', count: stats.generating },
    { key: 'completed', label: 'Completed', count: stats.completed },
    { key: 'failed', label: 'Failed', count: stats.failed },
  ]

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Blog Generator</h1>
          <p className="text-sm text-gray-500 mt-1">
            Automatically generate blog posts from production listings.
            Posts are created as drafts for your review{settings.auto_publish === 'true' ? ' (auto-publish ON)' : ''}.
          </p>
        </div>
        <Link href="/admin/blog" className="btn-outline text-sm">
          View All Posts
        </Link>
      </div>

      {dbError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200">
          <h3 className="text-sm font-semibold text-red-800 mb-1">Database tables not found</h3>
          <p className="text-sm text-red-700 mb-2">
            The blog generation tables haven&apos;t been created yet. Run the migration SQL in your{' '}
            <a href="https://supabase.com/dashboard/project/ynwdhnlnawemmxjrtgyy/sql/new" target="_blank" rel="noreferrer"
              className="underline font-medium hover:text-red-900">Supabase Dashboard SQL Editor</a>.
          </p>
          <p className="text-xs text-red-500 font-mono">{dbError}</p>
        </div>
      )}

      {settingsFlash && (
        <div className={`mb-4 px-4 py-2 rounded text-sm ${
          settingsFlash.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {settingsFlash.msg}
        </div>
      )}

      {/* Settings Card */}
      <div className="admin-card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Generation Settings</h2>

        {settingsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#3ea8c8]" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {/* Enabled */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Auto-Generation</label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#3ea8c8]"
                  value={settings.enabled}
                  onChange={e => setSettings(s => ({ ...s, enabled: e.target.value }))}
                >
                  <option value="true">Enabled (cron runs 3x/day)</option>
                  <option value="false">Disabled</option>
                </select>
              </div>

              {/* Posts per day */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Posts/Day</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="10"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#3ea8c8]"
                  value={settings.posts_per_day}
                  onChange={e => setSettings(s => ({ ...s, posts_per_day: e.target.value }))}
                />
                <p className="text-xs text-gray-400 mt-0.5">Daily limit for auto-generation</p>
              </div>

              {/* Batch size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Batch Size</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#3ea8c8]"
                  value={settings.batch_size}
                  onChange={e => setSettings(s => ({ ...s, batch_size: e.target.value }))}
                />
                <p className="text-xs text-gray-400 mt-0.5">Posts per cron run</p>
              </div>

              {/* Auto-publish */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Auto-Publish</label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#3ea8c8]"
                  value={settings.auto_publish}
                  onChange={e => setSettings(s => ({ ...s, auto_publish: e.target.value }))}
                >
                  <option value="false">Save as Draft (review first)</option>
                  <option value="true">Publish immediately</option>
                </select>
              </div>

              {/* Min data score */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Data Score</label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#3ea8c8]"
                  value={settings.min_production_data_score}
                  onChange={e => setSettings(s => ({ ...s, min_production_data_score: e.target.value }))}
                />
                <p className="text-xs text-gray-400 mt-0.5">Min fields filled to qualify (1-8)</p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button onClick={saveSettings} disabled={settingsSaving} className="btn-primary text-sm">
                {settingsSaving ? 'Saving...' : 'Save Settings'}
              </button>
              <Link href="/admin/ai-settings" className="text-sm text-[#3ea8c8] hover:underline">
                Edit AI Prompt
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Generate Controls */}
      <div className="admin-card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Generate Blog Posts</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePopulate}
              disabled={populating || generating}
              className="btn-outline text-sm"
            >
              {populating ? (
                <span className="flex items-center gap-1.5">
                  <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current" />
                  Scanning...
                </span>
              ) : (
                'Auto-Populate Queue'
              )}
            </button>
            <button
              onClick={() => handleGenerate()}
              disabled={generating || stats.pending === 0}
              className="btn-primary text-sm"
            >
              {generating ? (
                <span className="flex items-center gap-1.5">
                  <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                  Generating...
                </span>
              ) : (
                `Generate Batch (${stats.pending} pending)`
              )}
            </button>
          </div>
        </div>

        {/* Live progress */}
        {progress.length > 0 && (
          <div className="space-y-2 mb-4">
            {progress.map((p, i) => (
              <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded text-sm ${
                p.status === 'completed' ? 'bg-green-50 text-green-700' :
                p.status === 'failed' ? 'bg-red-50 text-red-700' :
                'bg-blue-50 text-blue-700'
              }`}>
                {p.status === 'generating' && (
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current flex-shrink-0" />
                )}
                {p.status === 'completed' && (
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {p.status === 'failed' && (
                  <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <span className="flex-1">
                  {p.title
                    ? <>{p.title} {p.blogPostId && <Link href={`/admin/blog/${p.blogPostId}/edit`} className="underline ml-1">Edit</Link>}</>
                    : `Production #${p.productionId}`
                  }
                </span>
                {p.error && <span className="text-xs text-red-500 truncate max-w-[200px]">{p.error}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Stats summary */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Pending', value: stats.pending, color: 'bg-yellow-50 text-yellow-700' },
            { label: 'Generating', value: stats.generating, color: 'bg-blue-50 text-blue-700' },
            { label: 'Completed', value: stats.completed, color: 'bg-green-50 text-green-700' },
            { label: 'Failed', value: stats.failed, color: 'bg-red-50 text-red-700' },
            { label: 'Total', value: stats.total, color: 'bg-gray-50 text-gray-700' },
          ].map(s => (
            <div key={s.label} className={`${s.color} rounded-lg px-3 py-2 text-center`}>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Queue Table */}
      <div className="admin-card p-0 overflow-hidden">
        {/* Queue tabs */}
        <div className="flex items-center gap-1 px-4 pt-4 border-b border-gray-200">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setQueueTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                queueTab === t.key
                  ? 'border-[#3ea8c8] text-[#3ea8c8]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  queueTab === t.key ? 'bg-[#3ea8c8]/10 text-[#3ea8c8]' : 'bg-gray-100 text-gray-500'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}

          {/* Bulk actions */}
          <div className="ml-auto flex items-center gap-2 pb-2">
            {stats.failed > 0 && (
              <button onClick={handleRetryFailed} className="text-xs text-orange-600 hover:underline">
                Retry Failed
              </button>
            )}
            {stats.completed > 0 && (
              <button onClick={handleClearCompleted} className="text-xs text-gray-400 hover:underline">
                Clear Completed
              </button>
            )}
          </div>
        </div>

        {queueLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#3ea8c8]" />
          </div>
        ) : queue.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="mb-2">Queue is empty</p>
            <p className="text-xs">Click &quot;Auto-Populate Queue&quot; to find eligible productions</p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Production</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Added</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {queue.map(item => (
                <tr key={item.id}>
                  <td>
                    <Link
                      href={`/admin/productions/${item.production_id}/edit`}
                      className="font-medium text-gray-900 hover:text-[#3ea8c8] transition-colors"
                    >
                      {item.productions?.title || `Production #${item.production_id}`}
                    </Link>
                    {item.productions?.computed_status && (
                      <span className="ml-2 text-[10px] text-gray-400 uppercase">
                        {item.productions.computed_status.replace(/-/g, ' ')}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${
                      item.status === 'completed' ? 'bg-green-100 text-green-700' :
                      item.status === 'failed' ? 'bg-red-100 text-red-700' :
                      item.status === 'generating' ? 'bg-blue-100 text-blue-700' :
                      item.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {item.status}
                    </span>
                    {item.error && (
                      <span className="block text-[10px] text-red-400 mt-0.5 truncate max-w-[200px]" title={item.error}>
                        {item.error}
                      </span>
                    )}
                  </td>
                  <td className="text-sm text-gray-500">{item.attempts}</td>
                  <td className="text-sm text-gray-500">
                    {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {item.status === 'completed' && item.blog_post_id && (
                        <Link
                          href={`/admin/blog/${item.blog_post_id}/edit`}
                          className="text-xs btn-outline py-1 px-2"
                        >
                          View Post
                        </Link>
                      )}
                      {(item.status === 'pending' || item.status === 'failed') && (
                        <button
                          onClick={() => handleGenerate(item.id)}
                          disabled={generating}
                          className="text-xs btn-primary py-1 px-2"
                        >
                          Generate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
