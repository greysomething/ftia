'use client'

import { useRouter, usePathname } from 'next/navigation'
import { Fragment, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { formatDateTime } from '@/lib/utils'

interface LogEntry {
  id: number
  user_id: string | null
  email: string | null
  event_type: string
  ip_address: string | null
  user_agent: string | null
  country: string | null
  city: string | null
  region: string | null
  metadata: Record<string, unknown>
  created_at: string
}

interface Stats {
  logins24h: number
  failed24h: number
  registrations24h: number
  total: number
}

interface Filters {
  eventType: string
  search: string
  fromDate: string
  toDate: string
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  login: { label: 'Login', color: 'bg-green-100 text-green-800' },
  login_failed: { label: 'Failed Login', color: 'bg-red-100 text-red-800' },
  register: { label: 'Registration', color: 'bg-blue-100 text-blue-800' },
  logout: { label: 'Logout', color: 'bg-gray-100 text-gray-600' },
  password_reset: { label: 'Password Reset', color: 'bg-yellow-100 text-yellow-800' },
  password_reset_failed: { label: 'Reset Failed', color: 'bg-red-100 text-red-800' },
  membership_changed: { label: 'Membership', color: 'bg-orange-100 text-orange-800' },
  email_sent: { label: 'Email Sent', color: 'bg-sky-100 text-sky-800' },
  pdf_download: { label: 'PDF Download', color: 'bg-purple-100 text-purple-800' },
  profile_update: { label: 'Profile Update', color: 'bg-indigo-100 text-indigo-800' },
  contact_form: { label: 'Contact Form', color: 'bg-teal-100 text-teal-800' },
}

function formatLocation(entry: LogEntry) {
  const parts = [entry.city, entry.region, entry.country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : '—'
}

function parseUA(ua: string | null): string {
  if (!ua) return '—'
  // Simple extraction
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome'
  if (ua.includes('Edg')) return 'Edge'
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('PostmanRuntime')) return 'Postman'
  return ua.substring(0, 30) + '...'
}

/** Human-readable summary of metadata for the Event column */
function metadataSummary(eventType: string, metadata: Record<string, unknown>): string | null {
  if (!metadata || Object.keys(metadata).length === 0) return null

  if (eventType === 'membership_changed') {
    const action = metadata.action as string | undefined
    const status = metadata.status as string | undefined
    const stripeStatus = metadata.stripe_status as string | undefined
    if (action === 'status_changed' && status) return `Status → ${status}${stripeStatus ? ` (Stripe: ${stripeStatus})` : ''}`
    if (action === 'created') return 'New subscription'
    if (action === 'deleted') return 'Subscription deleted'
    if (action) return action.replace(/_/g, ' ')
  }

  if (eventType === 'email_sent') {
    const template = metadata.template as string | undefined
    const subject = metadata.subject as string | undefined
    return template || subject || null
  }

  if (eventType === 'pdf_download') {
    const title = metadata.title as string | undefined
    return title || null
  }

  if (eventType === 'contact_form') {
    const subject = metadata.subject as string | undefined
    return subject || null
  }

  if (eventType === 'login_failed') {
    const reason = metadata.reason as string | undefined
    return reason || null
  }

  return null
}

/** Format metadata as readable key-value lines */
function formatMetadata(metadata: Record<string, unknown>): string {
  return Object.entries(metadata)
    .map(([k, v]) => {
      const label = k.replace(/_/g, ' ')
      const value = typeof v === 'object' ? JSON.stringify(v) : String(v)
      return `${label}: ${value}`
    })
    .join('\n')
}

export function LoginLogClient({
  logs,
  stats,
  totalCount,
  currentPage,
  perPage,
  filters,
}: {
  logs: LogEntry[]
  stats: Stats
  totalCount: number
  currentPage: number
  perPage: number
  filters: Filters
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [search, setSearch] = useState(filters.search)
  const [fromDate, setFromDate] = useState(filters.fromDate)
  const [toDate, setToDate] = useState(filters.toDate)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  const totalPages = Math.ceil(totalCount / perPage)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    const merged = {
      type: filters.eventType,
      search: filters.search,
      from: filters.fromDate,
      to: filters.toDate,
      page: String(currentPage),
      ...overrides,
    }
    Object.entries(merged).forEach(([k, v]) => {
      if (v && v !== 'all' && v !== '1') p.set(k, v)
    })
    const qs = p.toString()
    return pathname + (qs ? '?' + qs : '')
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    router.push(buildUrl({ search, page: '1' }))
  }

  function handleDateFilter() {
    router.push(buildUrl({ from: fromDate, to: toDate, page: '1' }))
  }

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Activity Log</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="admin-card text-center">
          <p className="text-3xl font-bold text-green-600">{stats.logins24h}</p>
          <p className="text-xs text-gray-500 mt-1">Logins (24h)</p>
        </div>
        <div className="admin-card text-center">
          <p className="text-3xl font-bold text-red-600">{stats.failed24h}</p>
          <p className="text-xs text-gray-500 mt-1">Failed Logins (24h)</p>
        </div>
        <div className="admin-card text-center">
          <p className="text-3xl font-bold text-blue-600">{stats.registrations24h}</p>
          <p className="text-xs text-gray-500 mt-1">Registrations (24h)</p>
        </div>
        <div className="admin-card text-center">
          <p className="text-3xl font-bold text-gray-700">{totalCount.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Total Events</p>
        </div>
      </div>

      {/* Filters */}
      <div className="admin-card mb-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Event Type Tabs */}
          <div className="flex-1 min-w-[200px]">
            <label className="form-label">Event Type</label>
            <div className="flex flex-wrap gap-1">
              {['all', 'login', 'login_failed', 'logout', 'register', 'password_reset', 'membership_changed', 'email_sent', 'pdf_download', 'profile_update', 'contact_form'].map(type => (
                <button
                  key={type}
                  onClick={() => router.push(buildUrl({ type, page: '1' }))}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    filters.eventType === type
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {type === 'all' ? 'All' : EVENT_LABELS[type]?.label ?? type}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div>
              <label className="form-label">Search</label>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Email or IP..."
                className="form-input text-sm w-48"
              />
            </div>
            <button type="submit" className="btn-primary text-sm px-3 self-end">
              Search
            </button>
          </form>

          {/* Date Range */}
          <div className="flex gap-2 items-end">
            <div>
              <label className="form-label">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="form-label">To</label>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="form-input text-sm"
              />
            </div>
            <button onClick={handleDateFilter} className="btn-outline text-sm px-3 self-end">
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Log Table */}
      <div className="admin-card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Event</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">IP Address</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Location</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Browser</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Time</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  No activity found.
                </td>
              </tr>
            ) : (
              logs.map(log => {
                const evt = EVENT_LABELS[log.event_type] ?? { label: log.event_type, color: 'bg-gray-100 text-gray-600' }
                const summary = metadataSummary(log.event_type, log.metadata)
                const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0
                const isExpanded = expandedRow === log.id
                return (
                  <Fragment key={log.id}>
                    <tr className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${evt.color}`}>
                          {evt.label}
                        </span>
                        {summary && (
                          <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{summary}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {log.user_id ? (
                          <a href={`/admin/users/${log.user_id}`} className="text-primary hover:underline">
                            {log.email ?? '—'}
                          </a>
                        ) : (
                          <span className="text-gray-500">{log.email ?? '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        {log.ip_address ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {formatLocation(log)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {parseUA(log.user_agent)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap" title={formatDateTime(log.created_at)}>
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-3">
                        {hasMetadata && (
                          <button
                            onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                            className={`text-gray-400 hover:text-gray-600 transition-colors ${isExpanded ? 'text-gray-600' : ''}`}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && hasMetadata && (
                      <tr className="bg-gray-50">
                        <td colSpan={7} className="px-4 py-3">
                          <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono">{formatMetadata(log.metadata)}</pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Showing {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, totalCount)} of {totalCount.toLocaleString()}
          </p>
          <div className="flex gap-1">
            {currentPage > 1 && (
              <a href={buildUrl({ page: String(currentPage - 1) })} className="btn-outline text-sm px-3 py-1.5">
                Previous
              </a>
            )}
            {currentPage < totalPages && (
              <a href={buildUrl({ page: String(currentPage + 1) })} className="btn-outline text-sm px-3 py-1.5">
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
