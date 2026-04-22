'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type Tab = 'queue' | 'sources' | 'settings'

export function DiscoveryClient() {
  const [tab, setTab] = useState<Tab>('queue')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Discovery</h1>
          <p className="text-sm text-gray-500 mt-1">
            Automated RSS monitoring → AI extraction → draft productions.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
        {(['queue', 'sources', 'settings'] as Tab[]).map(t => {
          const label = t[0].toUpperCase() + t.slice(1)
          const active = tab === t
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                active ? 'border-[#3ea8c8] text-[#3ea8c8]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {tab === 'queue' && <QueueTab />}
      {tab === 'sources' && <SourcesTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Queue tab
 * ────────────────────────────────────────────────────────────────────────── */

interface Item {
  id: number
  title: string
  link: string | null
  summary: string | null
  published_at: string | null
  status: string
  source_id: number | null
  discovery_sources?: { name: string; url: string } | null
  production_id: number | null
  duplicate_of: number | null
  extraction_score: number | null
  extraction_data: any
  error: string | null
  created_at: string
  processed_at: string | null
}

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'extracted', label: 'Below threshold' },
  { key: 'created', label: 'Created' },
  { key: 'duplicate', label: 'Duplicates' },
  { key: 'filtered_out', label: 'Filtered out' },
  { key: 'error', label: 'Errors' },
  { key: 'skipped', label: 'Skipped' },
]

function statusBadge(status: string): string {
  switch (status) {
    case 'new':          return 'bg-blue-100 text-blue-700'
    case 'extracting':   return 'bg-purple-100 text-purple-700'
    case 'extracted':    return 'bg-yellow-100 text-yellow-700'
    case 'created':      return 'bg-green-100 text-green-700'
    case 'duplicate':    return 'bg-gray-100 text-gray-600'
    case 'filtered_out': return 'bg-gray-100 text-gray-500'
    case 'error':        return 'bg-red-100 text-red-700'
    case 'skipped':      return 'bg-gray-100 text-gray-500'
    default:             return 'bg-gray-100 text-gray-600'
  }
}

function scoreClass(score: number | null): string {
  if (score == null) return 'bg-gray-100 text-gray-500'
  if (score >= 85) return 'bg-green-100 text-green-700'
  if (score >= 60) return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-700'
}

function QueueTab() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [polling, setPolling] = useState(false)
  const [batchExtracting, setBatchExtracting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') params.set('status', filter)
      if (search.trim()) params.set('q', search.trim())
      const res = await fetch(`/api/admin/discovery/items?${params}`)
      const data = await res.json()
      if (res.ok) {
        setItems(data.items ?? [])
        setCounts(data.counts ?? {})
      }
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => { load() }, [load])

  async function itemAction(id: number, action: string) {
    setBusy(prev => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/admin/discovery/items/${id}?action=${action}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) alert(data.error || 'Action failed')
      await load()
    } finally {
      setBusy(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  async function deleteItem(id: number) {
    if (!confirm('Remove this item from the discovery queue?')) return
    setBusy(prev => new Set(prev).add(id))
    try {
      await fetch(`/api/admin/discovery/items/${id}`, { method: 'DELETE' })
      await load()
    } finally {
      setBusy(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  async function pollNow() {
    setPolling(true)
    try {
      const res = await fetch('/api/admin/discovery/poll', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) alert(data.error || 'Poll failed')
      else alert(`Polled ${data.sources_polled ?? 0} source(s). ${data.new_items ?? 0} new items.`)
      await load()
    } finally { setPolling(false) }
  }

  async function extractBatch() {
    if (!confirm('Run extraction on the next batch of pending items?')) return
    setBatchExtracting(true)
    try {
      const res = await fetch('/api/admin/discovery/extract-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) alert(data.error || 'Batch extract failed')
      else alert(`Processed ${data.processed ?? 0} item(s).`)
      await load()
    } finally { setBatchExtracting(false) }
  }

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={pollNow} disabled={polling} className="btn-outline text-sm disabled:opacity-50">
          {polling ? 'Polling…' : 'Poll sources now'}
        </button>
        <button onClick={extractBatch} disabled={batchExtracting} className="btn-outline text-sm disabled:opacity-50">
          {batchExtracting ? 'Extracting…' : 'Extract next batch'}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') load() }}
            placeholder="Search title…"
            className="form-input text-sm max-w-xs"
          />
          <button onClick={load} className="text-sm btn-outline">Search</button>
        </div>
      </div>

      {/* Status tab bar */}
      <div className="flex items-center gap-1 border-b border-gray-200 flex-wrap">
        {STATUS_FILTERS.map(s => {
          const count = s.key === 'all'
            ? Object.values(counts).reduce((a, b) => a + b, 0)
            : (counts[s.key] ?? 0)
          const active = filter === s.key
          return (
            <button key={s.key} onClick={() => setFilter(s.key)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                active ? 'border-[#3ea8c8] text-[#3ea8c8]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {s.label}
              {count > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full ${active ? 'bg-[#3ea8c8]/10' : 'bg-gray-100'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Items table */}
      <div className="admin-card p-0 overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="w-16">ID</th>
              <th>Title / Source</th>
              <th>Status</th>
              <th>Score</th>
              <th>Discovered</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center text-gray-400 py-10">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-gray-400 py-10">No items.</td></tr>
            ) : items.map(item => (
              <tr key={item.id} className="align-top">
                <td className="text-xs text-gray-400">{item.id}</td>
                <td>
                  <div className="font-medium text-gray-900">
                    {item.link
                      ? <a href={item.link} target="_blank" rel="noopener" className="hover:underline">{item.title}</a>
                      : item.title}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {item.discovery_sources?.name ?? '—'}
                  </div>
                  {item.error && (
                    <div className="text-[11px] text-red-600 mt-1">{item.error}</div>
                  )}
                  {expanded.has(item.id) && item.extraction_data && (
                    <ExtractionPreview data={item.extraction_data} />
                  )}
                </td>
                <td>
                  <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded ${statusBadge(item.status)}`}>
                    {item.status.replace('_', ' ')}
                  </span>
                  {item.production_id && (
                    <div className="mt-1">
                      <Link href={`/admin/productions/${item.production_id}/edit`}
                        className="text-[11px] text-[#3ea8c8] hover:underline">
                        → Draft #{item.production_id}
                      </Link>
                    </div>
                  )}
                  {item.duplicate_of && (
                    <div className="mt-1">
                      <Link href={`/admin/productions/${item.duplicate_of}/edit`}
                        className="text-[11px] text-gray-500 hover:underline">
                        ↗ Existing #{item.duplicate_of}
                      </Link>
                    </div>
                  )}
                </td>
                <td>
                  {item.extraction_score != null && (
                    <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded ${scoreClass(item.extraction_score)}`}>
                      {item.extraction_score}/100
                    </span>
                  )}
                </td>
                <td className="text-[11px] text-gray-500 whitespace-nowrap">
                  {new Date(item.created_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1.5 flex-wrap">
                    {item.extraction_data && (
                      <button onClick={() => toggleExpand(item.id)}
                        className="text-[11px] text-gray-500 hover:text-gray-700">
                        {expanded.has(item.id) ? 'Hide' : 'Details'}
                      </button>
                    )}
                    {(item.status === 'new' || item.status === 'error' || item.status === 'extracted') && (
                      <button onClick={() => itemAction(item.id, 'extract')}
                        disabled={busy.has(item.id)}
                        className="text-[11px] btn-outline py-0.5 px-2 disabled:opacity-50">
                        {busy.has(item.id) ? '…' : (item.status === 'extracted' ? 'Re-extract' : 'Extract')}
                      </button>
                    )}
                    {item.status === 'duplicate' && (
                      <button onClick={() => itemAction(item.id, 'create-anyway')}
                        disabled={busy.has(item.id)}
                        className="text-[11px] btn-outline py-0.5 px-2 text-purple-600 border-purple-300 disabled:opacity-50">
                        Create anyway
                      </button>
                    )}
                    {item.status === 'extracted' && (
                      <button onClick={() => itemAction(item.id, 'create-anyway')}
                        disabled={busy.has(item.id)}
                        className="text-[11px] btn-outline py-0.5 px-2 text-green-600 border-green-300 disabled:opacity-50">
                        Approve → Draft
                      </button>
                    )}
                    {item.status !== 'skipped' && item.status !== 'created' && (
                      <button onClick={() => itemAction(item.id, 'skip')}
                        disabled={busy.has(item.id)}
                        className="text-[11px] text-gray-500 hover:text-gray-700 disabled:opacity-50">
                        Skip
                      </button>
                    )}
                    <button onClick={() => deleteItem(item.id)}
                      disabled={busy.has(item.id)}
                      className="text-[11px] text-red-500 hover:text-red-700 disabled:opacity-50">
                      ×
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ExtractionPreview({ data }: { data: any }) {
  return (
    <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded text-[11px] space-y-1">
      <div><strong>Extracted:</strong> {data.title ?? '—'}</div>
      {data.excerpt && <div className="text-gray-600">{data.excerpt}</div>}
      <div className="flex flex-wrap gap-2 text-gray-500">
        {data.production_type_slug && <span>Type: <strong>{data.production_type_slug}</strong></span>}
        {data.production_status_slug && <span>Status: <strong>{data.production_status_slug}</strong></span>}
        {data.production_phase && <span>Phase: <strong>{data.production_phase}</strong></span>}
        {data.network && <span>Network: <strong>{data.network}</strong></span>}
      </div>
      {data.crew?.length > 0 && (
        <div><strong>Crew:</strong> {data.crew.map((c: any) => `${c.role_name}: ${c.inline_name}`).join(' · ')}</div>
      )}
      {data.companies?.length > 0 && (
        <div><strong>Companies:</strong> {data.companies.map((c: any) => c.inline_name).join(' · ')}</div>
      )}
      {data.locations?.length > 0 && (
        <div><strong>Locations:</strong> {data.locations.map((l: any) => [l.city, l.country].filter(Boolean).join(', ')).join(' · ')}</div>
      )}
      {data.notes && <div className="italic text-gray-500">{data.notes}</div>}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Sources tab
 * ────────────────────────────────────────────────────────────────────────── */

interface Source {
  id: number
  name: string
  url: string
  source_type: string
  enabled: boolean
  last_polled_at: string | null
  last_error: string | null
  success_count: number
  failure_count: number
}

function SourcesTab() {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newSource, setNewSource] = useState({ name: '', url: '', source_type: 'rss' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/discovery/sources')
    if (res.ok) {
      const data = await res.json()
      setSources(data.sources ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleEnabled(id: number, current: boolean) {
    await fetch(`/api/admin/discovery/sources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !current }),
    })
    load()
  }

  async function deleteSource(id: number) {
    if (!confirm('Delete this source? Items already in the queue will remain.')) return
    await fetch(`/api/admin/discovery/sources/${id}`, { method: 'DELETE' })
    load()
  }

  async function addSource() {
    if (!newSource.name.trim() || !newSource.url.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/discovery/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSource),
      })
      const data = await res.json()
      if (!res.ok) alert(data.error || 'Failed to add source')
      else {
        setShowAdd(false)
        setNewSource({ name: '', url: '', source_type: 'rss' })
        load()
      }
    } finally { setSaving(false) }
  }

  async function redecodeItems() {
    if (!confirm('Re-decode HTML entities in all existing discovery items? This fixes legacy items polled before the entity-decoder fix. Safe to run anytime.')) return
    const res = await fetch('/api/admin/discovery/redecode', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) alert(data.error || 'Failed')
    else alert(`Scanned ${data.scanned}, updated ${data.updated} items.`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {sources.filter(s => s.enabled).length} of {sources.length} enabled
        </p>
        <div className="flex items-center gap-2">
          <button onClick={redecodeItems} className="btn-outline text-xs"
            title="Re-decode HTML entities in existing discovery items">
            Fix legacy entities
          </button>
          <button onClick={() => setShowAdd(v => !v)} className="btn-primary text-sm">
            {showAdd ? 'Cancel' : '+ Add Source'}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="admin-card space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="form-label">Name</label>
              <input value={newSource.name} onChange={e => setNewSource({ ...newSource, name: e.target.value })}
                placeholder="Variety — Film" className="form-input text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="form-label">Feed URL</label>
              <input value={newSource.url} onChange={e => setNewSource({ ...newSource, url: e.target.value })}
                placeholder="https://..." className="form-input text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Type:</label>
            <select value={newSource.source_type} onChange={e => setNewSource({ ...newSource, source_type: e.target.value })}
              className="form-input text-xs w-24">
              <option value="rss">RSS</option>
              <option value="atom">Atom</option>
            </select>
            <button onClick={addSource} disabled={saving} className="ml-auto btn-primary text-sm disabled:opacity-50">
              {saving ? 'Saving…' : 'Add'}
            </button>
          </div>
        </div>
      )}

      <div className="admin-card p-0 overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="w-12">On</th>
              <th>Name / URL</th>
              <th>Last Polled</th>
              <th>Success / Fail</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center text-gray-400 py-10">Loading…</td></tr>
            ) : sources.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-gray-400 py-10">No sources yet.</td></tr>
            ) : sources.map(s => (
              <tr key={s.id}>
                <td>
                  <label className="inline-flex items-center">
                    <input type="checkbox" checked={s.enabled} onChange={() => toggleEnabled(s.id, s.enabled)}
                      className="rounded border-gray-300 text-[#3ea8c8]" />
                  </label>
                </td>
                <td>
                  <div className="font-medium text-gray-900">{s.name}</div>
                  <div className="text-[11px] text-gray-400 truncate max-w-md">{s.url}</div>
                  {s.last_error && <div className="text-[11px] text-red-600 mt-0.5">{s.last_error}</div>}
                </td>
                <td className="text-[11px] text-gray-500">
                  {s.last_polled_at
                    ? new Date(s.last_polled_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                    : 'Never'}
                </td>
                <td className="text-[11px]">
                  <span className="text-green-700">{s.success_count}</span> / <span className="text-red-700">{s.failure_count}</span>
                </td>
                <td className="text-right">
                  <button onClick={() => deleteSource(s.id)} className="text-[11px] text-red-500 hover:text-red-700">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Settings tab
 * ────────────────────────────────────────────────────────────────────────── */

const DEFAULT_SETTINGS = {
  enabled: 'true',
  extraction_enabled: 'true',
  extraction_batch_size: '5',
  extraction_daily_cap: '30',
  extraction_threshold: '85',
  dedup_threshold: '85',
  keyword_filter: '[]',
}

function SettingsTab() {
  const [settings, setSettings] = useState<Record<string, string>>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/discovery/settings').then(r => r.json()).then(d => {
      if (d.settings) setSettings({ ...DEFAULT_SETTINGS, ...d.settings })
    }).finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/discovery/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        setFlash('Settings saved.')
        setTimeout(() => setFlash(null), 2500)
      } else {
        const data = await res.json()
        alert(data.error || 'Save failed')
      }
    } finally { setSaving(false) }
  }

  function set<K extends keyof typeof DEFAULT_SETTINGS>(key: K, value: string) {
    setSettings(s => ({ ...s, [key]: value }))
  }

  if (loading) return <div className="admin-card p-6 text-sm text-gray-500">Loading settings…</div>

  return (
    <div className="admin-card space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Pipeline</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="form-label text-sm">Master switch</label>
            <select value={settings.enabled} onChange={e => set('enabled', e.target.value)} className="form-input">
              <option value="true">Enabled</option>
              <option value="false">Disabled (no polling, no extraction)</option>
            </select>
          </div>
          <div>
            <label className="form-label text-sm">Extraction</label>
            <select value={settings.extraction_enabled} onChange={e => set('extraction_enabled', e.target.value)} className="form-input">
              <option value="true">Auto-extract via cron</option>
              <option value="false">Manual only</option>
            </select>
            <p className="text-xs text-gray-400 mt-0.5">If manual, polling still runs but items stay as 'new'.</p>
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t border-gray-100 pt-4">
        <h2 className="text-sm font-semibold text-gray-700">Extraction Limits</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="form-label text-sm">Batch size (per cron run)</label>
            <input type="number" min="1" max="20"
              value={settings.extraction_batch_size}
              onChange={e => set('extraction_batch_size', e.target.value)}
              className="form-input text-sm" />
            <p className="text-xs text-gray-400 mt-0.5">Items processed per hourly run</p>
          </div>
          <div>
            <label className="form-label text-sm">Daily cap</label>
            <input type="number" min="1" max="500"
              value={settings.extraction_daily_cap}
              onChange={e => set('extraction_daily_cap', e.target.value)}
              className="form-input text-sm" />
            <p className="text-xs text-gray-400 mt-0.5">Max extractions per UTC day (cost ceiling)</p>
          </div>
          <div>
            <label className="form-label text-sm">Auto-create threshold</label>
            <input type="number" min="0" max="100" step="5"
              value={settings.extraction_threshold}
              onChange={e => set('extraction_threshold', e.target.value)}
              className="form-input text-sm" />
            <p className="text-xs text-gray-400 mt-0.5">Score ≥ this → auto-draft; below → queue</p>
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t border-gray-100 pt-4">
        <h2 className="text-sm font-semibold text-gray-700">Dedup</h2>
        <div>
          <label className="form-label text-sm">Duplicate match threshold</label>
          <input type="number" min="50" max="100" step="5"
            value={settings.dedup_threshold}
            onChange={e => set('dedup_threshold', e.target.value)}
            className="form-input text-sm max-w-xs" />
          <p className="text-xs text-gray-400 mt-0.5">Title similarity % above which a new item is flagged as a duplicate of an existing production</p>
        </div>
      </section>

      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <button onClick={save} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        {flash && <span className="text-sm text-green-700">{flash}</span>}
      </div>
    </div>
  )
}
