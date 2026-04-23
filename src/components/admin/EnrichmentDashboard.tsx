'use client'

import { useState } from 'react'
import { formatDate } from '@/lib/utils'
import type { EnrichmentSettings } from '@/lib/enrichment-settings'
import type { EnrichmentRunSummary } from '@/lib/enrichment-queries'

interface EnrichmentRunRow {
  id: number
  started_at: string
  finished_at: string | null
  entity_type: 'company' | 'crew'
  entity_id: number
  entity_name: string | null
  fields_updated: number
  confidence_avg: number | null
  status: 'updated' | 'skipped' | 'error'
  error: string | null
  triggered_by: string
}

interface Totals {
  companies_total: number
  companies_enriched: number
  crew_total: number
  crew_enriched: number
}

interface Props {
  initialSettings: EnrichmentSettings
  totals: Totals
  daily: EnrichmentRunSummary[]
  recent: EnrichmentRunRow[]
}

export function EnrichmentDashboard({ initialSettings, totals, daily, recent }: Props) {
  const [settings, setSettings] = useState<EnrichmentSettings>(initialSettings)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [tab, setTab] = useState<'overview' | 'history' | 'settings'>('overview')

  function showFlash(type: 'success' | 'error', message: string) {
    setFlash({ type, message })
    setTimeout(() => setFlash(null), 3500)
  }

  async function saveSettings() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/enrichment-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Save failed')
      setSettings(body.settings)
      showFlash('success', 'Settings saved')
    } catch (err: any) {
      showFlash('error', err.message)
    } finally {
      setSaving(false)
    }
  }

  const companyPct = totals.companies_total > 0 ? Math.round((totals.companies_enriched / totals.companies_total) * 100) : 0
  const crewPct = totals.crew_total > 0 ? Math.round((totals.crew_enriched / totals.crew_total) * 100) : 0

  const last7Days = daily.slice(0, 7)
  const totalUpdated30d = daily.reduce((s, d) => s + d.updated, 0)
  const totalErrors30d = daily.reduce((s, d) => s + d.errors, 0)
  const totalFields30d = daily.reduce((s, d) => s + d.fields_updated_total, 0)

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Profile Enrichment</h1>
        <p className="text-sm text-gray-500 mt-1">
          Nightly cron that finds the least-complete published profiles and fills in
          missing fields via AI web research. Runs at <strong>9am PDT / 8am PST</strong> daily.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {(['overview', 'history', 'settings'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-2 px-1 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-[#3ea8c8] text-[#3ea8c8]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <KpiCard label="Updated (30d)" value={totalUpdated30d} />
            <KpiCard label="Fields filled (30d)" value={totalFields30d} />
            <KpiCard label="Errors (30d)" value={totalErrors30d} tone={totalErrors30d > 0 ? 'red' : 'gray'} />
            <KpiCard
              label="Status"
              valueText={settings.enabled ? 'Active' : 'Paused'}
              tone={settings.enabled ? 'green' : 'amber'}
            />
          </div>

          {/* Coverage */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CoverageCard
              label="Companies enriched"
              done={totals.companies_enriched}
              total={totals.companies_total}
              pct={companyPct}
            />
            <CoverageCard
              label="People enriched"
              done={totals.crew_enriched}
              total={totals.crew_total}
              pct={crewPct}
            />
          </div>

          {/* Last 7 days */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Last 7 days</h2>
            {last7Days.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No runs yet — first nightly run will populate this.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Processed</th>
                    <th className="py-2 font-medium text-green-700">Updated</th>
                    <th className="py-2 font-medium text-gray-500">Skipped</th>
                    <th className="py-2 font-medium text-red-600">Errors</th>
                    <th className="py-2 font-medium">Fields filled</th>
                  </tr>
                </thead>
                <tbody>
                  {last7Days.map(d => (
                    <tr key={d.date} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 text-gray-700">{d.date}</td>
                      <td className="py-2 text-gray-700">{d.total}</td>
                      <td className="py-2 text-green-700 font-medium">{d.updated}</td>
                      <td className="py-2 text-gray-500">{d.skipped}</td>
                      <td className={`py-2 font-medium ${d.errors > 0 ? 'text-red-600' : 'text-gray-400'}`}>{d.errors}</td>
                      <td className="py-2 text-gray-700">{d.fields_updated_total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* HISTORY */}
      {tab === 'history' && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              Recent enrichment attempts ({recent.length})
            </h2>
            <span className="text-xs text-gray-400">Last 30 days · max 100 rows</span>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-gray-400 italic px-5 py-8 text-center">
              No enrichment runs yet. The nightly cron will populate this list.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs text-gray-500">
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Entity</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Fields</th>
                  <th className="px-4 py-2 font-medium">Confidence</th>
                  <th className="px-4 py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(r => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{formatDate(r.started_at)}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        r.entity_type === 'company' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                      }`}>
                        {r.entity_type}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <a
                        href={`/admin/${r.entity_type === 'company' ? 'companies' : 'crew'}/${r.entity_id}/edit`}
                        className="text-[#3ea8c8] hover:underline"
                      >
                        {r.entity_name ?? `#${r.entity_id}`}
                      </a>
                    </td>
                    <td className="px-4 py-2"><StatusPill status={r.status} /></td>
                    <td className="px-4 py-2 text-gray-700">{r.fields_updated}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {r.confidence_avg != null ? `${(r.confidence_avg * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-red-600 max-w-xs truncate" title={r.error ?? ''}>
                      {r.error ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* SETTINGS */}
      {tab === 'settings' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-2xl space-y-5">
          <ToggleRow
            label="Enable nightly enrichment"
            help="Master switch — when off, the cron runs but skips immediately."
            checked={settings.enabled}
            onChange={v => setSettings(s => ({ ...s, enabled: v }))}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Batch size
              <span className="text-xs font-normal text-gray-500 ml-2">
                Profiles to enrich per nightly run (1–50)
              </span>
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={settings.batch_size}
              onChange={e => setSettings(s => ({ ...s, batch_size: Number(e.target.value) }))}
              className="w-32 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#3ea8c8] focus:border-[#3ea8c8]"
            />
            <p className="text-xs text-gray-500 mt-1">
              Each profile = ~1 web-search call. 10/night ≈ $30/mo.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cool-down (days between re-enriching the same profile)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={settings.min_days_between_runs}
              onChange={e => setSettings(s => ({ ...s, min_days_between_runs: Number(e.target.value) }))}
              className="w-32 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#3ea8c8] focus:border-[#3ea8c8]"
            />
          </div>

          <div className="border-t border-gray-100 pt-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">Targets</label>
            <ToggleRow
              label="Companies"
              checked={settings.target_companies}
              onChange={v => setSettings(s => ({ ...s, target_companies: v }))}
              compact
            />
            <ToggleRow
              label="People (crew)"
              checked={settings.target_crew}
              onChange={v => setSettings(s => ({ ...s, target_crew: v }))}
              compact
            />
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={saveSettings}
              disabled={saving}
              className="bg-[#3ea8c8] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#2e8aa8] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save settings'}
            </button>
            {flash && (
              <span className={`text-sm ${flash.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {flash.message}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function KpiCard({
  label, value, valueText, tone = 'gray',
}: { label: string; value?: number; valueText?: string; tone?: 'gray' | 'red' | 'green' | 'amber' }) {
  const toneClass = {
    gray: 'text-gray-900', red: 'text-red-600', green: 'text-green-600', amber: 'text-amber-600',
  }[tone]
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneClass}`}>
        {valueText ?? (value ?? 0).toLocaleString()}
      </div>
    </div>
  )
}

function CoverageCard({ label, done, total, pct }: { label: string; done: number; total: number; pct: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-700 font-medium">{label}</span>
        <span className="text-gray-500">{done.toLocaleString()} / {total.toLocaleString()} ({pct}%)</span>
      </div>
      <div className="mt-2 h-2 bg-gray-100 rounded overflow-hidden">
        <div className="h-full bg-[#3ea8c8]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: 'updated' | 'skipped' | 'error' }) {
  const cls = status === 'updated'
    ? 'bg-green-50 text-green-700'
    : status === 'error'
      ? 'bg-red-50 text-red-700'
      : 'bg-gray-100 text-gray-600'
  return <span className={`text-xs px-1.5 py-0.5 rounded ${cls}`}>{status}</span>
}

function ToggleRow({
  label, help, checked, onChange, compact,
}: { label: string; help?: string; checked: boolean; onChange: (v: boolean) => void; compact?: boolean }) {
  return (
    <label className={`flex items-start gap-3 cursor-pointer ${compact ? 'py-1.5' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#3ea8c8] focus:ring-[#3ea8c8]"
      />
      <span>
        <span className="block text-sm font-medium text-gray-700">{label}</span>
        {help && <span className="block text-xs text-gray-500 mt-0.5">{help}</span>}
      </span>
    </label>
  )
}
