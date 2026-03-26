'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

interface DataPoint {
  date: string
  signups: number
  rebills: number
  revenue: number
}

interface Summary {
  signups: number
  rebills: number
  revenue: number
}

const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
]

function formatDateLabel(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00')
  if (days <= 30) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d = new Date(label + 'T00:00:00')
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-3 text-sm">
      <p className="font-semibold text-gray-900 mb-1.5">{dateStr}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-600">{entry.name}:</span>
          <span className="font-semibold text-gray-900">
            {entry.name === 'Revenue' ? `$${entry.value.toFixed(2)}` : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export function AnalyticsChart() {
  const [data, setData] = useState<DataPoint[]>([])
  const [summary, setSummary] = useState<Summary>({ signups: 0, rebills: 0, revenue: 0 })
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/analytics?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d.chartData ?? [])
        setSummary(d.summary ?? { signups: 0, rebills: 0, revenue: 0 })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [days])

  return (
    <div className="admin-card mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Growth Analytics</h2>
          <p className="text-xs text-gray-400 mt-0.5">New sign-ups, payments, and revenue</p>
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
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg p-3.5">
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">New Sign-ups</p>
          <p className="text-2xl font-bold text-blue-900 mt-1">{summary.signups.toLocaleString()}</p>
          <p className="text-xs text-blue-500 mt-0.5">Last {days} days</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-lg p-3.5">
          <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Payments</p>
          <p className="text-2xl font-bold text-emerald-900 mt-1">{summary.rebills.toLocaleString()}</p>
          <p className="text-xs text-emerald-500 mt-0.5">Last {days} days</p>
        </div>
        <div className="bg-gradient-to-br from-violet-50 to-violet-100/50 rounded-lg p-3.5">
          <p className="text-xs font-medium text-violet-600 uppercase tracking-wider">Revenue</p>
          <p className="text-2xl font-bold text-violet-900 mt-1">${summary.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-xs text-violet-500 mt-0.5">Last {days} days</p>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[280px]">
        {loading ? (
          <div className="h-full bg-gray-50 rounded-lg animate-pulse flex items-center justify-center">
            <span className="text-sm text-gray-400">Loading chart data...</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradSignups" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradRebills" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
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
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              />
              <Area
                type="monotone"
                dataKey="signups"
                name="Sign-ups"
                stroke="#3B82F6"
                strokeWidth={2}
                fill="url(#gradSignups)"
                dot={days <= 30}
                activeDot={{ r: 5, strokeWidth: 2, fill: '#fff' }}
              />
              <Area
                type="monotone"
                dataKey="rebills"
                name="Payments"
                stroke="#10B981"
                strokeWidth={2}
                fill="url(#gradRebills)"
                dot={days <= 30}
                activeDot={{ r: 5, strokeWidth: 2, fill: '#fff' }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="#8B5CF6"
                strokeWidth={2}
                fill="url(#gradRevenue)"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, fill: '#fff' }}
                yAxisId="right"
                hide
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
