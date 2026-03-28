'use client'

import { useState, useEffect } from 'react'

interface StripeStats {
  grossVolume: number
  netVolume: number
  totalFees: number
  paymentCount: number
  failedCount: number
  failedVolume: number
  refundCount: number
  refundVolume: number
  avgTransaction: number
  stripeMrr: number
  period: string
  periodLabel: string
}

const PERIODS = [
  { value: 'mtd', label: 'Month to Date' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'last4w', label: 'Last 4 Weeks' },
  { value: 'ytd', label: 'Year to Date' },
  { value: 'last12m', label: 'Last 12 Months' },
]

function formatCompact(cents: number): string {
  const dollars = cents / 100
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`
  return `$${dollars.toFixed(2)}`
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

interface Props {
  /** Server-side stats that don't depend on Stripe API */
  activeCount: number
  newThisMonth: number
  needsAttention: number
  totalSubscriptions: number
  totalOrders: number
}

export default function StripeStatsCards({ activeCount, newThisMonth, needsAttention, totalSubscriptions, totalOrders }: Props) {
  const [period, setPeriod] = useState('mtd')
  const [stats, setStats] = useState<StripeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function fetchStats(p: string) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/stripe-stats?period=${p}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to fetch' }))
        setError(data.error || 'Failed to fetch Stripe stats')
        return
      }
      const data = await res.json()
      setStats(data)
    } catch (err: any) {
      setError(err.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats(period)
  }, [period])

  const shimmer = 'animate-pulse bg-gray-200 rounded h-7 w-20'

  return (
    <div className="mb-6">
      {/* Period selector */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Revenue Overview</h2>
          {stats && !loading && (
            <span className="text-xs text-gray-400">via Stripe</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button
            onClick={() => fetchStats(period)}
            disabled={loading}
            className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
            title="Refresh"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-3 text-sm">
          {error}
        </div>
      )}

      {/* Row 1: Stripe-powered revenue cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {/* MRR */}
        <div className="admin-card border-accent">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-accent/10 text-accent">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="text-xs text-gray-500 font-medium">MRR</span>
          </div>
          {loading ? <div className={shimmer} /> : (
            <p className="text-2xl font-bold text-gray-900">{formatCompact(stats?.stripeMrr ?? 0)}</p>
          )}
          {!loading && stats && (
            <p className="text-xs text-gray-400 mt-0.5">ARR: {formatCompact((stats.stripeMrr ?? 0) * 12)}</p>
          )}
        </div>

        {/* Gross Volume */}
        <div className="admin-card">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-emerald-50 text-emerald-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-xs text-gray-500 font-medium">Gross Volume</span>
          </div>
          {loading ? <div className={shimmer} /> : (
            <p className="text-2xl font-bold text-gray-900">{formatCompact(stats?.grossVolume ?? 0)}</p>
          )}
          {!loading && stats && (
            <p className="text-xs text-gray-400 mt-0.5">{stats.paymentCount} payments</p>
          )}
        </div>

        {/* Net Volume */}
        <div className="admin-card">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-blue-50 text-blue-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
              </svg>
            </div>
            <span className="text-xs text-gray-500 font-medium">Net Volume</span>
          </div>
          {loading ? <div className={shimmer} /> : (
            <p className="text-2xl font-bold text-gray-900">{formatCompact(stats?.netVolume ?? 0)}</p>
          )}
          {!loading && stats && (
            <p className="text-xs text-gray-400 mt-0.5">
              Fees: -{formatCurrency(stats.totalFees ?? 0)}
              {stats.refundCount > 0 && <> | Refunds: -{formatCurrency(stats.refundVolume)}</>}
            </p>
          )}
        </div>

        {/* Failed / Success Rate */}
        <div className="admin-card">
          <div className="flex items-center gap-2 mb-1">
            <div className={`p-1.5 rounded-md ${(stats?.failedCount ?? 0) > 0 ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="text-xs text-gray-500 font-medium">Success Rate</span>
          </div>
          {loading ? <div className={shimmer} /> : (
            <>
              {(() => {
                const total = (stats?.paymentCount ?? 0) + (stats?.failedCount ?? 0)
                const rate = total > 0 ? ((stats?.paymentCount ?? 0) / total * 100).toFixed(1) : '100.0'
                return <p className="text-2xl font-bold text-gray-900">{rate}%</p>
              })()}
            </>
          )}
          {!loading && stats && stats.failedCount > 0 && (
            <p className="text-xs text-red-400 mt-0.5">{stats.failedCount} failed ({formatCurrency(stats.failedVolume)})</p>
          )}
        </div>
      </div>

      {/* Row 2: Quick counts (from DB, always instant) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="admin-card flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-50 text-green-600 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{activeCount.toLocaleString()}</p>
            <p className="text-xs text-gray-500">Active Subscriptions</p>
          </div>
        </div>

        <div className="admin-card flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{newThisMonth.toLocaleString()}</p>
            <p className="text-xs text-gray-500">New This Month</p>
          </div>
        </div>

        <div className="admin-card flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-100 text-gray-600 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{totalOrders.toLocaleString()}</p>
            <p className="text-xs text-gray-500">Total Orders</p>
          </div>
        </div>

        <div className="admin-card flex items-center gap-3">
          <div className={`p-2 rounded-lg flex-shrink-0 ${needsAttention > 0 ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-400'}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{needsAttention.toLocaleString()}</p>
            <p className="text-xs text-gray-500">Needs Attention</p>
          </div>
        </div>
      </div>
    </div>
  )
}
