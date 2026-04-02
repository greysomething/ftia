'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'

interface DataPoint {
  date: string
  newSignups: number
  rebills: number
  signupRevenue: number
  rebillRevenue: number
  revenue: number
  refunds: number
  refundAmount: number
}

interface Summary {
  newSignups: number
  rebills: number
  revenue: number
  signupRevenue: number
  rebillRevenue: number
  refunds: number
  refundAmount: number
}

const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
]

function formatDateLabel(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00')
  if (days <= 7) return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
  if (days <= 30) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (days <= 90) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d = new Date(label + 'T00:00:00')
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  // Get counts from chart bars
  const newSignups = payload.find((p: any) => p.dataKey === 'newSignups')
  const rebills = payload.find((p: any) => p.dataKey === 'rebills')

  // Revenue fields aren't rendered as bars, so read from the underlying data point
  const dataPoint = payload[0]?.payload as DataPoint | undefined
  const totalPayments = (newSignups?.value ?? 0) + (rebills?.value ?? 0)
  const totalRevenue = dataPoint?.revenue ?? 0
  const refunds = dataPoint?.refunds ?? 0
  const refundAmount = dataPoint?.refundAmount ?? 0

  return (
    <div className="bg-white border border-gray-200 shadow-xl rounded-xl p-4 text-sm min-w-[200px]">
      <p className="font-semibold text-gray-900 mb-2 pb-2 border-b border-gray-100">{dateStr}</p>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
            <span className="text-gray-600">New Sign-ups</span>
          </div>
          <span className="font-semibold text-gray-900">{newSignups?.value ?? 0}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            <span className="text-gray-600">Recurring</span>
          </div>
          <span className="font-semibold text-gray-900">{rebills?.value ?? 0}</span>
        </div>
        {refunds > 0 && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-400" />
              <span className="text-gray-600">Refunds</span>
            </div>
            <span className="font-semibold text-red-600">{refunds} (−${refundAmount.toFixed(2)})</span>
          </div>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-500">Total Payments</span>
          <span className="font-bold text-gray-900">{totalPayments}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-500">Net Revenue</span>
          <span className="font-bold text-emerald-700">${totalRevenue.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}

export function AnalyticsChart() {
  const [data, setData] = useState<DataPoint[]>([])
  const [summary, setSummary] = useState<Summary>({ newSignups: 0, rebills: 0, revenue: 0, signupRevenue: 0, rebillRevenue: 0, refunds: 0, refundAmount: 0 })
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/analytics?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d.chartData ?? [])
        setSummary(d.summary ?? { newSignups: 0, rebills: 0, revenue: 0, signupRevenue: 0, rebillRevenue: 0, refunds: 0, refundAmount: 0 })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [days])

  const totalPayments = summary.newSignups + summary.rebills
  const avgDaily = days > 0 ? (summary.revenue / days) : 0

  return (
    <div className="admin-card mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Payment Analytics</h2>
          <p className="text-xs text-gray-400 mt-0.5">Stripe transactions (ET) — sign-ups, recurring, and refunds</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                days === r.days
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg p-3.5">
          <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">New Sign-ups</p>
          <p className="text-2xl font-bold text-blue-900 mt-1">{summary.newSignups.toLocaleString()}</p>
          <p className="text-xs text-blue-500 mt-0.5">${summary.signupRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} revenue</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-lg p-3.5">
          <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Recurring</p>
          <p className="text-2xl font-bold text-emerald-900 mt-1">{summary.rebills.toLocaleString()}</p>
          <p className="text-xs text-emerald-500 mt-0.5">${summary.rebillRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} revenue</p>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100/50 rounded-lg p-3.5">
          <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider">Refunds</p>
          <p className="text-2xl font-bold text-red-900 mt-1">{summary.refunds.toLocaleString()}</p>
          <p className="text-xs text-red-500 mt-0.5">−${summary.refundAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-gradient-to-br from-violet-50 to-violet-100/50 rounded-lg p-3.5">
          <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider">Net Revenue</p>
          <p className="text-2xl font-bold text-violet-900 mt-1">${summary.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-xs text-violet-500 mt-0.5">{totalPayments} payments</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-lg p-3.5">
          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Daily Avg</p>
          <p className="text-2xl font-bold text-amber-900 mt-1">${avgDaily.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-xs text-amber-500 mt-0.5">per day ({days}D)</p>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[300px]">
        {loading ? (
          <div className="h-full bg-gray-50 rounded-lg animate-pulse flex items-center justify-center">
            <span className="text-sm text-gray-400">Loading payment data...</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatDateLabel(v, days)}
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={{ stroke: '#E5E7EB' }}
                tickLine={false}
                interval={days <= 7 ? 0 : days <= 30 ? 3 : days <= 90 ? 10 : 30}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                width={35}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F9FAFB' }} />
              <Legend
                iconType="square"
                iconSize={10}
                wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
              />
              <ReferenceLine y={0} stroke="#E5E7EB" />
              <Bar
                dataKey="newSignups"
                name="New Sign-ups"
                fill="#3B82F6"
                radius={[2, 2, 0, 0]}
                stackId="payments"
              />
              <Bar
                dataKey="rebills"
                name="Recurring"
                fill="#10B981"
                radius={[2, 2, 0, 0]}
                stackId="payments"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
