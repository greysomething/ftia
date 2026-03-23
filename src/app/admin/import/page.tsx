'use client'

import { useState } from 'react'

type ImportType =
  | 'taxonomy' | 'productions' | 'contacts' | 'crew'
  | 'relations' | 'blog' | 'pages' | 'media' | 'users' | 'memberships'

type Status = 'idle' | 'running' | 'done' | 'error'

interface ImportItem {
  type: ImportType
  label: string
  description: string
}

const IMPORT_ITEMS: ImportItem[] = [
  { type: 'taxonomy',    label: 'Taxonomy',    description: 'Production types, statuses, union tags' },
  { type: 'productions', label: 'Productions', description: 'All WP productions (custom post type)' },
  { type: 'contacts',    label: 'Companies',   description: 'Production contacts (companies)' },
  { type: 'crew',        label: 'Crew',        description: 'Cast & crew role listings' },
  { type: 'relations',   label: 'Relations',   description: 'Production ↔ contact/crew/type links' },
  { type: 'blog',        label: 'Blog',        description: 'WordPress blog posts + categories/tags' },
  { type: 'pages',       label: 'Pages',       description: 'WordPress pages' },
  { type: 'media',       label: 'Media',       description: 'WP media library attachments' },
  { type: 'users',       label: 'Users',       description: 'WordPress users → Supabase profiles' },
  { type: 'memberships', label: 'Memberships', description: 'Membership records from WP' },
]

function CleanPhpDataButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleClean() {
    if (!confirm('This will clean all PHP serialized data from company addresses, phones, faxes, emails and crew contact fields. Continue?')) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/clean-php-data', { method: 'POST' })
      const data = await res.json()
      setResult(data.message ?? JSON.stringify(data))
    } catch (err: any) {
      setResult('Error: ' + (err.message ?? 'Unknown'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-card mb-6 border-orange-200 bg-orange-50">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-orange-800">🧹 Clean PHP Serialized Data</h3>
          <p className="text-sm text-orange-700 mt-1">
            Strips PHP serialized formatting from all company/crew contact fields (addresses, phones, faxes, emails)
            and reformats phone numbers to (xxx) xxx-xxxx.
          </p>
        </div>
        <button onClick={handleClean} disabled={loading} className="btn-primary whitespace-nowrap ml-4">
          {loading ? 'Cleaning…' : 'Run Cleanup'}
        </button>
      </div>
      {result && (
        <div className="mt-3 p-3 bg-white border border-orange-200 rounded text-sm text-orange-800">
          {result}
        </div>
      )}
    </div>
  )
}

export default function AdminImportPage() {
  const [statuses, setStatuses] = useState<Record<ImportType, Status>>({} as any)
  const [outputs, setOutputs] = useState<Record<ImportType, string>>({} as any)

  async function runImport(type: ImportType) {
    setStatuses((s) => ({ ...s, [type]: 'running' }))
    setOutputs((o) => ({ ...o, [type]: '' }))

    try {
      const res = await fetch(`/api/admin/import/${type}`, { method: 'POST' })
      const data = await res.json()
      setStatuses((s) => ({ ...s, [type]: data.success ? 'done' : 'error' }))
      setOutputs((o) => ({ ...o, [type]: data.output ?? '' }))
    } catch (err: any) {
      setStatuses((s) => ({ ...s, [type]: 'error' }))
      setOutputs((o) => ({ ...o, [type]: err.message ?? 'Unknown error' }))
    }
  }

  function statusBadge(type: ImportType) {
    const s = statuses[type] ?? 'idle'
    const map: Record<Status, string> = {
      idle:    'badge badge-gray',
      running: 'badge badge-yellow',
      done:    'badge badge-green',
      error:   'badge badge-red',
    }
    return <span className={map[s]}>{s === 'idle' ? 'Ready' : s === 'running' ? 'Running…' : s === 'done' ? 'Done' : 'Error'}</span>
  }

  const [expandedOutput, setExpandedOutput] = useState<ImportType | null>(null)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Data Import</h1>
        <p className="text-sm text-gray-500 mt-1">
          Run migration scripts to import data from the legacy WordPress MySQL database into Supabase.
          Run <strong>Taxonomy first</strong>, then Productions, then the rest.
        </p>
      </div>

      <div className="admin-card p-0 overflow-hidden mb-6">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Import Type</th>
              <th>Description</th>
              <th>Status</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {IMPORT_ITEMS.map(({ type, label, description }) => (
              <tr key={type}>
                <td className="font-medium">{label}</td>
                <td className="text-gray-500 text-sm">{description}</td>
                <td>{statusBadge(type)}</td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {outputs[type] && (
                      <button
                        type="button"
                        onClick={() => setExpandedOutput(expandedOutput === type ? null : type)}
                        className="text-xs btn-outline py-1 px-2"
                      >
                        {expandedOutput === type ? 'Hide Log' : 'Show Log'}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={statuses[type] === 'running'}
                      onClick={() => runImport(type)}
                      className={`text-xs py-1 px-3 rounded font-medium transition-colors ${
                        statuses[type] === 'running'
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'btn-primary'
                      }`}
                    >
                      {statuses[type] === 'running' ? 'Running…' : statuses[type] === 'done' ? 'Re-run' : 'Run'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Database Cleanup */}
      <CleanPhpDataButton />

      {/* Output panel */}
      {expandedOutput && outputs[expandedOutput] && (
        <div className="admin-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700">
              Output — {IMPORT_ITEMS.find((i) => i.type === expandedOutput)?.label}
            </h2>
            <button type="button" onClick={() => setExpandedOutput(null)} className="text-xs text-gray-400 hover:text-gray-700">
              Close
            </button>
          </div>
          <pre className="bg-gray-950 text-green-400 text-xs p-4 rounded overflow-auto max-h-96 leading-relaxed whitespace-pre-wrap">
            {outputs[expandedOutput]}
          </pre>
        </div>
      )}

      <div className="admin-card bg-yellow-50 border-yellow-200">
        <h3 className="font-semibold text-yellow-800 mb-1">⚠️ Before running imports</h3>
        <ul className="text-sm text-yellow-700 space-y-1 list-disc ml-4">
          <li>Ensure the Local WP MySQL socket is running (open Local app and start the site)</li>
          <li>Ensure <code className="bg-yellow-100 px-1 rounded">.env.local</code> has the correct <code>MYSQL_SOCKET</code>, <code>MYSQL_DB</code>, and <code>SUPABASE_SERVICE_ROLE_KEY</code></li>
          <li>Run Taxonomy first — Productions and other types depend on it</li>
          <li>Run Relations after Productions, Contacts, and Crew are all imported</li>
          <li>Import scripts use upsert — re-running is safe and idempotent</li>
        </ul>
      </div>
    </div>
  )
}
