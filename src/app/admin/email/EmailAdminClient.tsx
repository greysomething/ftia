'use client'

import { useState, useEffect } from 'react'

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
}

const TAB_LIST = ['Overview', 'Templates', 'Logs'] as const
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
}: Props) {
  const [tab, setTab] = useState<Tab>('Overview')
  const [audiences, setAudiences] = useState(initialAudiences)
  const [audienceLoading, setAudienceLoading] = useState(false)

  // Logs state
  const [logs, setLogs] = useState(initialLogs)
  const [logTotal, setLogTotal] = useState(initialLogTotal)
  const [logPage, setLogPage] = useState(1)
  const [logStatus, setLogStatus] = useState('')
  const [logTemplate, setLogTemplate] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)

  // Test email state
  const [testingSlug, setTestingSlug] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState('')
  const [testResult, setTestResult] = useState<{ slug: string; success: boolean; message: string } | null>(null)

  // Preview state
  const [previewSlug, setPreviewSlug] = useState<string | null>(null)

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

  async function fetchLogs(page = 1, status = logStatus, template = logTemplate) {
    setLogsLoading(true)
    try {
      const params = new URLSearchParams({ action: 'logs', page: String(page) })
      if (status) params.set('status', status)
      if (template) params.set('template', template)
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
    if (!testEmail) return
    setTestingSlug(slug)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-test', templateSlug: slug, to: testEmail }),
      })
      const data = await res.json()
      setTestResult({
        slug,
        success: data.success,
        message: data.success ? `Test email sent to ${testEmail}` : (data.error ?? 'Failed to send'),
      })
      // Refresh logs after sending
      if (tab === 'Logs') fetchLogs()
    } finally {
      setTestingSlug(null)
    }
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
            <button
              onClick={refreshAudienceCounts}
              disabled={audienceLoading}
              className="btn-outline text-xs px-3 py-1"
            >
              {audienceLoading ? 'Refreshing...' : 'Refresh Counts'}
            </button>
          </div>
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
                      {email.created_at ? new Date(email.created_at).toLocaleDateString() : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
            {templates.map((tmpl) => (
              <div key={tmpl.slug} className="admin-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-gray-900">{tmpl.name}</h3>
                      <span className={`badge ${CATEGORY_COLORS[tmpl.category] ?? 'badge-gray'} text-xs`}>
                        {tmpl.category}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-2">{tmpl.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {tmpl.variables.map((v) => (
                        <span key={v} className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded font-mono">
                          {`{${v}}`}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
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
            ))}
          </div>
        </>
      )}

      {/* ===== LOGS TAB ===== */}
      {tab === 'Logs' && (
        <>
          {/* Filters */}
          <div className="admin-card mb-4">
            <div className="flex flex-wrap items-end gap-3">
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
                onClick={() => fetchLogs(logPage, logStatus, logTemplate)}
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
                      {log.sent_at ? new Date(log.sent_at).toLocaleString() : '--'}
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
