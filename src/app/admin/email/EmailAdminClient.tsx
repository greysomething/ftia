'use client'

import { useState, useEffect } from 'react'
import { formatDate, formatDateTime } from '@/lib/utils'

interface AudienceData {
  id: string
  label: string
  contactCount: number
}

interface EmailLog {
  id: string
  recipient: string
  subject: string
  template_slug: string | null
  status: string
  resend_id: string | null
  error_message: string | null
  sent_at: string
}

interface TemplateInfo {
  slug: string
  name: string
  description: string
  category: string
  variables: string[]
}

interface TemplateOverride {
  slug: string
  subject_override: string | null
  html_override: string | null
  is_active: boolean
  updated_at: string
}

interface ResentEmail {
  id: string
  to: string | string[]
  subject: string
  last_event: string
  created_at: string
}

interface Props {
  initialAudiences: AudienceData[]
  initialLogs: EmailLog[]
  initialLogTotal: number
  templates: TemplateInfo[]
  recentEmails: ResentEmail[]
  configStatus: {
    apiKey: boolean
    apiKeyPreview: string
    audienceId: boolean
    audienceIdPreview: string
    membersId: boolean
    membersIdPreview: string
    fromAddress: string
  }
  initialOverrides: TemplateOverride[]
}

const TAB_LIST = ['Overview', 'Automation', 'Digest Reports', 'Templates', 'Logs'] as const
type Tab = (typeof TAB_LIST)[number]

const STATUS_COLORS: Record<string, string> = {
  delivered: 'badge-green',
  sent: 'badge-blue',
  opened: 'badge-green',
  clicked: 'badge-green',
  bounced: 'badge-red',
  complained: 'badge-red',
  failed: 'badge-red',
  delivery_delayed: 'badge-yellow',
}

const CATEGORY_COLORS: Record<string, string> = {
  onboarding: 'badge-blue',
  auth: 'badge-yellow',
  membership: 'badge-green',
  notification: 'badge-gray',
  marketing: 'badge-purple',
}

export default function EmailAdminClient({
  initialAudiences,
  initialLogs,
  initialLogTotal,
  templates,
  recentEmails,
  configStatus,
  initialOverrides,
}: Props) {
  const [tab, setTab] = useState<Tab>('Overview')
  const [audiences, setAudiences] = useState(initialAudiences)
  const [audienceLoading, setAudienceLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ activeCount: number; pastCount: number; skipped: number; errors: number } | null>(null)

  // Logs state
  const [logs, setLogs] = useState(initialLogs)
  const [logTotal, setLogTotal] = useState(initialLogTotal)
  const [logPage, setLogPage] = useState(1)
  const [logStatus, setLogStatus] = useState('')
  const [logTemplate, setLogTemplate] = useState('')
  const [logSearch, setLogSearch] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)

  // Test email state
  const [testingSlug, setTestingSlug] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState('')
  const [testResult, setTestResult] = useState<{ slug: string; success: boolean; message: string } | null>(null)

  // Preview state
  const [previewSlug, setPreviewSlug] = useState<string | null>(null)

  // Template overrides state
  const [overrides, setOverrides] = useState<Record<string, TemplateOverride>>(
    () => {
      const map: Record<string, TemplateOverride> = {}
      for (const o of initialOverrides) map[o.slug] = o
      return map
    }
  )
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editHtml, setEditHtml] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  async function refreshAudienceCounts() {
    setAudienceLoading(true)
    try {
      const res = await fetch('/api/admin/email?action=audience-counts')
      if (res.ok) {
        const data = await res.json()
        setAudiences(data.audiences)
      }
    } finally {
      setAudienceLoading(false)
    }
  }

  async function syncAudiences() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/admin/sync-audiences', { method: 'POST' })
      if (!res.ok || !res.body) return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.type === 'done') {
              setSyncResult({ activeCount: evt.activeCount, pastCount: evt.pastCount, skipped: evt.skipped, errors: evt.errors })
              refreshAudienceCounts()
            }
          } catch { /* skip malformed lines */ }
        }
      }
    } finally {
      setSyncing(false)
    }
  }

  async function fetchLogs(page = 1, status = logStatus, template = logTemplate, search = logSearch) {
    setLogsLoading(true)
    try {
      const params = new URLSearchParams({ action: 'logs', page: String(page) })
      if (status) params.set('status', status)
      if (template) params.set('template', template)
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`/api/admin/email?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
        setLogTotal(data.total)
        setLogPage(data.page)
      }
    } finally {
      setLogsLoading(false)
    }
  }

  async function sendTestEmail(slug: string) {
    if (!testEmail) {
      setTestResult({ slug, success: false, message: 'Please enter an email address above first.' })
      return
    }
    setTestingSlug(slug)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-test', templateSlug: slug, to: testEmail }),
      })
      const text = await res.text()
      let data: any
      try {
        data = JSON.parse(text)
      } catch {
        setTestResult({ slug, success: false, message: `Server error: ${text.slice(0, 200)}` })
        return
      }
      setTestResult({
        slug,
        success: data.success,
        message: data.success ? `Test email sent to ${testEmail}` : (data.error ?? 'Failed to send'),
      })
      // Refresh logs after sending
      if (tab === 'Logs') fetchLogs()
    } catch (err: any) {
      setTestResult({ slug, success: false, message: `Network error: ${err.message ?? 'Unknown'}` })
    } finally {
      setTestingSlug(null)
    }
  }

  async function toggleTemplate(slug: string, isActive: boolean) {
    // Optimistic update
    setOverrides((prev) => ({
      ...prev,
      [slug]: {
        ...(prev[slug] ?? { slug, subject_override: null, html_override: null, updated_at: new Date().toISOString() }),
        is_active: isActive,
      },
    }))

    try {
      const res = await fetch('/api/admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle-template', slug, isActive }),
      })
      if (!res.ok) {
        // Revert on failure
        setOverrides((prev) => ({
          ...prev,
          [slug]: {
            ...prev[slug],
            is_active: !isActive,
          },
        }))
      }
    } catch {
      // Revert on error
      setOverrides((prev) => ({
        ...prev,
        [slug]: {
          ...prev[slug],
          is_active: !isActive,
        },
      }))
    }
  }

  function startEditing(slug: string) {
    const override = overrides[slug]
    setEditSubject(override?.subject_override ?? '')
    setEditHtml(override?.html_override ?? '')
    setEditingSlug(slug)
  }

  function cancelEditing() {
    setEditingSlug(null)
    setEditSubject('')
    setEditHtml('')
  }

  async function saveTemplate(slug: string) {
    setSavingTemplate(true)
    try {
      const isActive = overrides[slug]?.is_active ?? true
      const res = await fetch('/api/admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-template',
          slug,
          subject: editSubject || null,
          html: editHtml || null,
          isActive,
        }),
      })
      if (res.ok) {
        setOverrides((prev) => ({
          ...prev,
          [slug]: {
            slug,
            subject_override: editSubject || null,
            html_override: editHtml || null,
            is_active: isActive,
            updated_at: new Date().toISOString(),
          },
        }))
        setEditingSlug(null)
      }
    } finally {
      setSavingTemplate(false)
    }
  }

  async function resetTemplate(slug: string) {
    if (!confirm('Reset this template to default? Any customizations will be removed.')) return

    try {
      const res = await fetch('/api/admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-template', slug }),
      })
      if (res.ok) {
        setOverrides((prev) => {
          const next = { ...prev }
          delete next[slug]
          return next
        })
        if (editingSlug === slug) cancelEditing()
      }
    } catch { /* ignore */ }
  }

  const totalLogPages = Math.ceil(logTotal / 50)

  return (
    <div>
      {/* Tab nav */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TAB_LIST.map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t)
              if (t === 'Logs' && logs.length === 0) fetchLogs()
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ===== OVERVIEW TAB ===== */}
      {tab === 'Overview' && (
        <>
          {/* Audience Cards */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">Audiences</h2>
            <div className="flex gap-2">
              <button
                onClick={syncAudiences}
                disabled={syncing}
                className="btn-outline text-xs px-3 py-1"
              >
                {syncing ? 'Syncing...' : 'Sync from Database'}
              </button>
              <button
                onClick={refreshAudienceCounts}
                disabled={audienceLoading}
                className="btn-outline text-xs px-3 py-1"
              >
                {audienceLoading ? 'Refreshing...' : 'Refresh Counts'}
              </button>
            </div>
          </div>
          {syncResult && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 mb-4">
              Sync complete: {syncResult.activeCount} active, {syncResult.pastCount} past, {syncResult.skipped} skipped{syncResult.errors > 0 ? `, ${syncResult.errors} errors` : ''}.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {audiences.length > 0 ? audiences.map((aud) => (
              <div key={aud.id} className="admin-card flex items-center gap-4">
                <div className="p-3 rounded-lg flex-shrink-0 bg-gray-100 text-gray-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {aud.contactCount.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">{aud.label}</p>
                </div>
              </div>
            )) : (
              <div className="col-span-3 admin-card text-center py-8">
                <p className="text-gray-400">No Resend audiences configured.</p>
              </div>
            )}
          </div>

          {/* Configuration */}
          <div className="admin-card mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Configuration</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${configStatus.apiKey ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-gray-600">Resend API Key</span>
                <span className="text-gray-400 font-mono text-xs">{configStatus.apiKeyPreview}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${configStatus.audienceId ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="text-gray-600">Newsletter Audience</span>
                <span className="text-gray-400 font-mono text-xs">{configStatus.audienceIdPreview}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${configStatus.membersId ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="text-gray-600">Members Audience</span>
                <span className="text-gray-400 font-mono text-xs">{configStatus.membersIdPreview}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${configStatus.fromAddress ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="text-gray-600">From Address</span>
                <span className="text-gray-400 text-xs">{configStatus.fromAddress || 'Not set'}</span>
              </div>
            </div>
          </div>

          {/* Recent Emails from Resend */}
          <div className="admin-card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b">
              <h2 className="text-base font-semibold text-gray-900">Recent Emails (Resend)</h2>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>To</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Sent</th>
                </tr>
              </thead>
              <tbody>
                {(!recentEmails || recentEmails.length === 0) ? (
                  <tr><td colSpan={4} className="text-center text-gray-400 py-10">No recent emails found.</td></tr>
                ) : recentEmails.slice(0, 50).map((email) => (
                  <tr key={email.id}>
                    <td className="text-sm">
                      <span className="font-medium text-gray-700">
                        {Array.isArray(email.to) ? email.to.join(', ') : email.to}
                      </span>
                    </td>
                    <td className="text-sm text-gray-600">{email.subject ?? '--'}</td>
                    <td>
                      <span className={`badge ${STATUS_COLORS[email.last_event] ?? 'badge-gray'}`}>
                        {email.last_event ?? 'unknown'}
                      </span>
                    </td>
                    <td className="text-sm text-gray-500">
                      {email.created_at ? formatDate(email.created_at) : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ===== AUTOMATION TAB ===== */}
      {tab === 'Automation' && (
        <AutomationTab />
      )}

      {/* ===== DIGEST REPORTS TAB ===== */}
      {tab === 'Digest Reports' && (
        <DigestReportsTab />
      )}

      {/* ===== TEMPLATES TAB ===== */}
      {tab === 'Templates' && (
        <>
          {/* Test email input */}
          <div className="admin-card mb-6">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="form-label">Test Email Recipient</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="you@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
              </div>
              <p className="text-xs text-gray-400 pb-2">Enter an email address to send test emails below.</p>
            </div>
          </div>

          {/* Global test result message */}
          {testResult && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${
              testResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {testResult.message}
            </div>
          )}

          {/* Template cards */}
          <div className="space-y-4">
            {templates.map((tmpl) => {
              const override = overrides[tmpl.slug]
              const isActive = override ? override.is_active : true
              const isCustomized = !!(override?.subject_override || override?.html_override)
              const isEditing = editingSlug === tmpl.slug

              return (
                <div key={tmpl.slug} className={`admin-card ${!isActive ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-gray-900">{tmpl.name}</h3>
                        <span className={`badge ${CATEGORY_COLORS[tmpl.category] ?? 'badge-gray'} text-xs`}>
                          {tmpl.category}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          isCustomized
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {isCustomized ? 'Customized' : 'Default'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mb-2">{tmpl.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {tmpl.variables.map((v) => (
                          <span key={v} className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded font-mono">
                            {`{{${v}}}`}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {/* Active/Inactive toggle */}
                      <button
                        onClick={() => toggleTemplate(tmpl.slug, !isActive)}
                        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        style={{ backgroundColor: isActive ? '#22c55e' : '#d1d5db' }}
                        title={isActive ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            isActive ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <button
                        onClick={() => isEditing ? cancelEditing() : startEditing(tmpl.slug)}
                        className="btn-outline text-xs px-3 py-1.5"
                      >
                        {isEditing ? 'Cancel' : 'Edit'}
                      </button>
                      <button
                        onClick={() => setPreviewSlug(previewSlug === tmpl.slug ? null : tmpl.slug)}
                        className="btn-outline text-xs px-3 py-1.5"
                      >
                        {previewSlug === tmpl.slug ? 'Hide Preview' : 'Preview'}
                      </button>
                      <button
                        onClick={() => sendTestEmail(tmpl.slug)}
                        disabled={!testEmail || testingSlug === tmpl.slug}
                        className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                      >
                        {testingSlug === tmpl.slug ? 'Sending...' : 'Send Test'}
                      </button>
                    </div>
                  </div>

                  {/* Inline editor */}
                  {isEditing && (
                    <div className="mt-4 border rounded-lg p-4 bg-gray-50 space-y-3">
                      <div>
                        <label className="form-label">Subject Line Override</label>
                        <input
                          type="text"
                          className="form-input w-full"
                          placeholder="Leave empty to use default subject"
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          Use {'{{variableName}}'} for dynamic values. Leave empty to keep the default subject.
                        </p>
                      </div>
                      <div>
                        <label className="form-label">HTML Body Override</label>
                        <textarea
                          className="form-input w-full font-mono text-xs"
                          rows={12}
                          placeholder="Leave empty to use default HTML template"
                          value={editHtml}
                          onChange={(e) => setEditHtml(e.target.value)}
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          Use {'{{variableName}}'} for dynamic values. Leave empty to keep the default template.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => saveTemplate(tmpl.slug)}
                          disabled={savingTemplate}
                          className="btn-primary text-xs px-4 py-1.5 disabled:opacity-50"
                        >
                          {savingTemplate ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="btn-outline text-xs px-4 py-1.5"
                        >
                          Cancel
                        </button>
                        {isCustomized && (
                          <button
                            onClick={() => resetTemplate(tmpl.slug)}
                            className="text-xs text-red-600 hover:text-red-800 ml-auto"
                          >
                            Reset to Default
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Inline preview */}
                  {previewSlug === tmpl.slug && (
                    <div className="mt-4 border rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-3 py-2 border-b text-xs text-gray-500 font-medium">
                        Email Preview (with sample data)
                      </div>
                      <TemplatePreview slug={tmpl.slug} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ===== LOGS TAB ===== */}
      {tab === 'Logs' && (
        <>
          {/* Filters */}
          <div className="admin-card mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="form-label">Search</label>
                <input
                  type="text"
                  className="form-input text-sm w-full"
                  placeholder="Search by email or subject..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') fetchLogs(1, logStatus, logTemplate, logSearch) }}
                />
              </div>
              <div>
                <label className="form-label">Status</label>
                <select
                  className="form-input text-sm"
                  value={logStatus}
                  onChange={(e) => { setLogStatus(e.target.value); fetchLogs(1, e.target.value, logTemplate) }}
                >
                  <option value="">All Statuses</option>
                  <option value="sent">Sent</option>
                  <option value="delivered">Delivered</option>
                  <option value="bounced">Bounced</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div>
                <label className="form-label">Template</label>
                <select
                  className="form-input text-sm"
                  value={logTemplate}
                  onChange={(e) => { setLogTemplate(e.target.value); fetchLogs(1, logStatus, e.target.value) }}
                >
                  <option value="">All Templates</option>
                  {templates.map((t) => (
                    <option key={t.slug} value={t.slug}>{t.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => fetchLogs(logPage, logStatus, logTemplate, logSearch)}
                disabled={logsLoading}
                className="btn-outline text-sm px-3 py-1.5"
              >
                {logsLoading ? 'Loading...' : 'Refresh'}
              </button>
              <span className="text-xs text-gray-400 ml-auto">
                {logTotal.toLocaleString()} total log{logTotal !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Log table */}
          <div className="admin-card p-0 overflow-hidden">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Subject</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Sent At</th>
                </tr>
              </thead>
              <tbody>
                {logsLoading ? (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-10">Loading...</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-10">
                    No email logs found. Logs will appear here after emails are sent via the sendEmail utility.
                  </td></tr>
                ) : logs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-sm font-medium text-gray-700">{log.recipient}</td>
                    <td className="text-sm text-gray-600 max-w-[300px] truncate">{log.subject}</td>
                    <td className="text-sm">
                      {log.template_slug ? (
                        <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded font-mono">
                          {log.template_slug}
                        </span>
                      ) : (
                        <span className="text-gray-400">--</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_COLORS[log.status] ?? 'badge-gray'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="text-sm text-gray-500">
                      {log.sent_at ? formatDateTime(log.sent_at) : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalLogPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => fetchLogs(logPage - 1)}
                disabled={logPage <= 1 || logsLoading}
                className="btn-outline text-sm px-3 py-1.5 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {logPage} of {totalLogPages}
              </span>
              <button
                onClick={() => fetchLogs(logPage + 1)}
                disabled={logPage >= totalLogPages || logsLoading}
                className="btn-outline text-sm px-3 py-1.5 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const DAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

const TIMEZONE_OPTIONS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'UTC',
]

const AUDIENCE_OPTIONS = [
  { value: 'newsletter', label: 'Newsletter Subscribers (General Audience)' },
  { value: 'active_members', label: 'Active Members Only' },
  { value: 'past_members', label: 'Past Members Only' },
  { value: 'active_and_past', label: 'Active + Past Members' },
  { value: 'all', label: 'All Audiences (Newsletter + Members)' },
]

/**
 * Automation tab — configure weekly digest cron schedule.
 */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function AutomationTab() {
  const [settings, setSettings] = useState<{
    enabled: boolean
    day_of_week: number
    send_hour: number
    send_minute: number
    timezone: string
    min_productions: number
    send_to_audience: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [triggeringDigest, setTriggeringDigest] = useState(false)
  const [digestResult, setDigestResult] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [digestHistory, setDigestHistory] = useState<Array<{
    id: string
    recipient: string
    subject: string
    status: string
    resend_id: string | null
    error_message: string | null
    sent_at: string
  }>>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  async function fetchDigestHistory() {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/admin/email?action=digest-history')
      if (res.ok) {
        const data = await res.json()
        setDigestHistory(data.logs ?? [])
      }
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    fetch('/api/admin/email?action=digest-settings')
      .then(res => res.json())
      .then(data => {
        if (data.settings) {
          setSettings(data.settings)
        } else {
          setSettings({
            enabled: true,
            day_of_week: 1,
            send_hour: 10,
            send_minute: 0,
            timezone: 'America/New_York',
            min_productions: 40,
            send_to_audience: 'newsletter',
          })
        }
      })
      .finally(() => setLoading(false))

    fetchDigestHistory()
  }, [])

  async function saveSettings() {
    if (!settings) return
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-digest-settings', ...settings }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  async function triggerDigestNow() {
    if (!confirm('This will send the weekly digest to all subscribers right now. Are you sure?')) return
    setTriggeringDigest(true)
    setDigestResult(null)
    try {
      // Call send-weekly-digest directly (carries admin session cookies)
      const res = await fetch('/api/admin/send-weekly-digest?trigger=manual', {
        method: 'POST',
      })
      const text = await res.text()
      let data: any
      try {
        data = JSON.parse(text)
      } catch {
        setDigestResult({ message: `Server error: ${text.slice(0, 200)}`, type: 'error' })
        return
      }
      if (data.success) {
        const sent = data.stats?.sent ?? 0
        setDigestResult({ message: data.message || `Digest sent successfully to ${sent} recipients.`, type: sent > 0 ? 'success' : 'info' })
        fetchDigestHistory() // Refresh log table
      } else {
        setDigestResult({ message: data.error || 'Something went wrong', type: 'error' })
      }
    } catch (err: any) {
      setDigestResult({ message: `Error: ${err.message}`, type: 'error' })
    } finally {
      setTriggeringDigest(false)
    }
  }

  if (loading || !settings) {
    return <div className="admin-card text-center py-10 text-gray-400">Loading settings...</div>
  }

  const timeLabel = `${DAY_OPTIONS.find(d => d.value === settings.day_of_week)?.label ?? 'Monday'} at ${String(settings.send_hour).padStart(2, '0')}:${String(settings.send_minute).padStart(2, '0')}`

  return (
    <>
      {/* Status Banner */}
      <div className={`rounded-lg px-4 py-3 mb-6 text-sm flex items-center justify-between ${
        settings.enabled
          ? 'bg-green-50 border border-green-200 text-green-800'
          : 'bg-gray-50 border border-gray-200 text-gray-600'
      }`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${settings.enabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <strong>{settings.enabled ? 'Automation Active' : 'Automation Paused'}</strong>
          <span className="text-gray-500">—</span>
          <span>
            {settings.enabled
              ? `Starts checking ${timeLabel} (${settings.timezone.replace('America/', '').replace('_', ' ')}) — sends once list has ${settings.min_productions}+ productions`
              : 'No digests will be sent automatically'
            }
          </span>
        </div>
      </div>

      {/* Weekly Digest Settings */}
      <div className="admin-card mb-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-[#3ea8c8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Weekly Production Digest Schedule
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Enabled toggle */}
          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              style={{ backgroundColor: settings.enabled ? '#22c55e' : '#d1d5db' }}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
            <span className="text-sm text-gray-700">
              {settings.enabled ? 'Enabled — digest sends automatically' : 'Disabled — manual send only'}
            </span>
          </div>

          {/* Day of week */}
          <div>
            <label className="form-label">Send Day</label>
            <select
              className="form-input w-full"
              value={settings.day_of_week}
              onChange={e => setSettings({ ...settings, day_of_week: parseInt(e.target.value) })}
            >
              {DAY_OPTIONS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* Time */}
          <div>
            <label className="form-label">Send Time</label>
            <div className="flex gap-2">
              <select
                className="form-input flex-1"
                value={settings.send_hour}
                onChange={e => setSettings({ ...settings, send_hour: parseInt(e.target.value) })}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Timezone */}
          <div>
            <label className="form-label">Timezone</label>
            <select
              className="form-input w-full"
              value={settings.timezone}
              onChange={e => setSettings({ ...settings, timezone: e.target.value })}
            >
              {TIMEZONE_OPTIONS.map(tz => (
                <option key={tz} value={tz}>{tz.replace('America/', '').replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          {/* Min productions */}
          <div>
            <label className="form-label">Minimum Productions</label>
            <input
              type="number"
              className="form-input w-full"
              value={settings.min_productions}
              onChange={e => setSettings({ ...settings, min_productions: parseInt(e.target.value) || 40 })}
              min={1}
              max={100}
            />
            <p className="text-xs text-gray-400 mt-1">Won&apos;t send if weekly list has fewer productions</p>
          </div>

          {/* Audience */}
          <div className="sm:col-span-2">
            <label className="form-label">Send To</label>
            <select
              className="form-input w-full"
              value={settings.send_to_audience}
              onChange={e => setSettings({ ...settings, send_to_audience: e.target.value })}
            >
              {AUDIENCE_OPTIONS.map(a => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Save + Test */}
        <div className="flex items-center gap-3 mt-6 pt-4 border-t">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="btn-primary px-6 py-2 flex items-center gap-2"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
          </button>
          {saved && (
            <span className="text-sm text-green-600 font-medium">Settings saved successfully</span>
          )}
        </div>
      </div>

      {/* Manual Trigger */}
      <div className="admin-card mb-6">
        <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <svg className="w-5 h-5 text-[#3ea8c8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Send Digest Now
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Manually trigger the weekly digest. This bypasses the day/time schedule but still checks
          if the production list is ready and prevents duplicate sends for the same week.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={triggerDigestNow}
            disabled={triggeringDigest}
            className="bg-[#1B2A4A] hover:bg-[#243660] text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {triggeringDigest ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Sending...
              </>
            ) : 'Send Digest Now'}
          </button>
          {digestResult && (
            <span className={`text-sm font-medium ${
              digestResult.type === 'success' ? 'text-green-600' :
              digestResult.type === 'error' ? 'text-red-600' :
              'text-amber-600'
            }`}>
              {digestResult.message}
            </span>
          )}
        </div>
      </div>

      {/* Digest Send History */}
      <div className="admin-card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-[#3ea8c8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Digest Send Log
          </h3>
          <button
            onClick={fetchDigestHistory}
            disabled={historyLoading}
            className="btn-outline text-xs px-3 py-1"
          >
            {historyLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {historyLoading && digestHistory.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Loading digest history...</p>
        ) : digestHistory.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No digests have been sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase border-b">
                  <th className="pb-2 pr-4">Date & Time</th>
                  <th className="pb-2 pr-4">Trigger</th>
                  <th className="pb-2 pr-4">Recipients</th>
                  <th className="pb-2 pr-4">Sent</th>
                  <th className="pb-2 pr-4">Week</th>
                  <th className="pb-2 pr-4">Productions</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {digestHistory.map((log) => {
                  // Parse metadata from resend_id (we store JSON there)
                  let meta: { trigger?: string; sent?: number; failed?: number; productionCount?: number; weekMonday?: string; audience?: string } = {}
                  try {
                    if (log.resend_id && log.resend_id.startsWith('{')) {
                      meta = JSON.parse(log.resend_id)
                    }
                  } catch { /* ignore */ }

                  const recipientCount = log.recipient?.replace('bulk:', '') || '?'
                  const trigger = meta.trigger || 'unknown'
                  const sentCount = meta.sent ?? (parseInt(recipientCount) || 0)
                  const failedCount = meta.failed ?? 0
                  const prodCount = meta.productionCount ?? '—'
                  const weekMonday = meta.weekMonday || '—'

                  return (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="py-2.5 pr-4 whitespace-nowrap text-gray-700">
                        {new Date(log.sent_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}{' '}
                        <span className="text-gray-400">
                          {new Date(log.sent_at).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          trigger === 'manual'
                            ? 'bg-blue-50 text-blue-700'
                            : trigger === 'auto'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {trigger === 'manual' ? (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          )}
                          {trigger === 'manual' ? 'Manual' : trigger === 'auto' ? 'Automated' : 'Unknown'}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-700">{recipientCount}</td>
                      <td className="py-2.5 pr-4">
                        <span className="text-green-600 font-medium">{sentCount}</span>
                        {failedCount > 0 && (
                          <span className="text-red-500 ml-1">/ {failedCount} failed</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">{weekMonday !== '—' ? weekMonday : '—'}</td>
                      <td className="py-2.5 pr-4 text-gray-700">{prodCount}</td>
                      <td className="py-2.5">
                        {log.error_message ? (
                          <span className="badge-yellow text-xs" title={log.error_message}>Partial</span>
                        ) : (
                          <span className="badge-green text-xs">Success</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="admin-card">
        <h3 className="font-semibold text-gray-900 mb-3">How Automation Works</h3>
        <div className="text-sm text-gray-600 space-y-2">
          <p>
            A Vercel Cron job runs every hour. On the configured day, starting at the configured
            time, it checks if the current week&apos;s production list has been published with
            at least <strong>{settings.min_productions} productions</strong>.
          </p>
          <p><strong>The flow:</strong></p>
          <ol className="list-decimal list-inside space-y-1 text-gray-500 ml-2">
            <li>On {DAY_NAMES[settings.day_of_week]} at {settings.send_hour}:00, the cron starts checking</li>
            <li>If the weekly list isn&apos;t ready yet (not published or under {settings.min_productions} productions), it waits and re-checks every hour</li>
            <li>Once the list has {settings.min_productions}+ productions, the digest is sent automatically within the hour</li>
            <li>Won&apos;t re-send if the digest was already sent this week (prevents duplicates)</li>
          </ol>
          <p className="mt-2"><strong>Safety &amp; compliance:</strong></p>
          <ul className="list-disc list-inside space-y-1 text-gray-500 ml-2">
            <li>Includes <code className="bg-gray-100 px-1 rounded text-xs">List-Unsubscribe</code> headers for Gmail/Yahoo spam compliance</li>
            <li>Rate-limited to 5 emails per 1.2 seconds to avoid ISP spam filters</li>
          </ul>
        </div>
      </div>
    </>
  )
}

/**
 * Digest Reports tab — shows weekly digest send history, stats, and growth.
 */
function DigestReportsTab() {
  const [digestData, setDigestData] = useState<{
    sends: Array<{
      week: string
      total: number
      sent: number
      failed: number
      date: string
    }>
    totalSent: number
    totalFailed: number
    avgPerWeek: number
    lastSentAt: string | null
    cronEnabled: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDigestStats()
  }, [])

  async function fetchDigestStats() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/email?action=digest-stats')
      if (res.ok) {
        const data = await res.json()
        setDigestData(data)
      }
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="admin-card text-center py-10 text-gray-400">Loading digest reports...</div>
  }

  if (!digestData) {
    return <div className="admin-card text-center py-10 text-gray-400">Failed to load digest data.</div>
  }

  const { sends, totalSent, totalFailed, avgPerWeek, lastSentAt } = digestData

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="admin-card text-center">
          <p className="text-2xl font-bold text-[#1B2A4A]">{totalSent.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Total Digests Sent</p>
        </div>
        <div className="admin-card text-center">
          <p className="text-2xl font-bold text-green-600">
            {totalSent > 0 ? ((totalSent / (totalSent + totalFailed)) * 100).toFixed(1) : '0'}%
          </p>
          <p className="text-xs text-gray-500 mt-1">Delivery Rate</p>
        </div>
        <div className="admin-card text-center">
          <p className="text-2xl font-bold text-[#43B7F0]">{Math.round(avgPerWeek).toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Avg Recipients / Week</p>
        </div>
        <div className="admin-card text-center">
          <p className="text-2xl font-bold text-gray-700">
            {lastSentAt ? new Date(lastSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Last Sent</p>
        </div>
      </div>

      {/* Cron Status */}
      <div className="admin-card mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Automated Cron Schedule</h3>
            <p className="text-sm text-gray-500 mt-1">
              Weekly digest is scheduled to send every <strong>Monday at 10:00 AM ET</strong> via Vercel Cron.
              It only fires when the production list has 40+ productions.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Active
          </span>
        </div>
      </div>

      {/* Send History Table */}
      <div className="admin-card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Send History</h2>
          <button onClick={fetchDigestStats} className="btn-outline text-xs px-3 py-1">
            Refresh
          </button>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Week</th>
              <th>Date Sent</th>
              <th className="text-center">Recipients</th>
              <th className="text-center">Sent</th>
              <th className="text-center">Failed</th>
              <th className="text-center">Success Rate</th>
            </tr>
          </thead>
          <tbody>
            {sends.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-gray-400 py-10">
                  No weekly digests sent yet. Send your first digest from the Weekly Lists page.
                </td>
              </tr>
            ) : sends.map((send, i) => {
              const rate = send.total > 0 ? ((send.sent / send.total) * 100).toFixed(1) : '0'
              return (
                <tr key={i}>
                  <td className="font-medium text-gray-900">{send.week}</td>
                  <td className="text-sm text-gray-500">{send.date}</td>
                  <td className="text-center text-sm">{send.total.toLocaleString()}</td>
                  <td className="text-center">
                    <span className="text-sm font-medium text-green-600">{send.sent.toLocaleString()}</span>
                  </td>
                  <td className="text-center">
                    {send.failed > 0 ? (
                      <span className="text-sm font-medium text-red-600">{send.failed}</span>
                    ) : (
                      <span className="text-sm text-gray-400">0</span>
                    )}
                  </td>
                  <td className="text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      parseFloat(rate) >= 95 ? 'bg-green-100 text-green-700' :
                      parseFloat(rate) >= 80 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {rate}%
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

/**
 * Inline template preview component.
 * Renders sample HTML from the template in an iframe.
 */
function TemplatePreview({ slug }: { slug: string }) {
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    import('@/lib/email-templates').then(({ getTemplate }) => {
      const tmpl = getTemplate(slug)
      if (tmpl) {
        const sampleVars: Record<string, string> = {
          firstName: 'Jane',
          role: 'Producer',
          country: 'United States',
          resetLink: 'https://productionlist.com/reset-password?token=sample',
          planName: 'Annual Professional',
          expiresAt: 'December 31, 2026',
          weekDate: 'March 24, 2026',
          productionCount: '24',
          digestUrl: 'https://productionlist.com/production-list',
          subject: 'General Inquiry',
        }
        const rendered = tmpl.render(sampleVars)
        setHtml(rendered.html)
      }
      setLoading(false)
    })
  }, [slug])

  if (loading) return <div className="p-4 text-sm text-gray-400">Loading preview...</div>
  if (!html) return <div className="p-4 text-sm text-gray-400">Preview not available.</div>

  return (
    <div className="bg-white p-4">
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
