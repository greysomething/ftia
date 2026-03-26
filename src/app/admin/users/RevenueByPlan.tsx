'use client'

import { useState } from 'react'

interface PlanStat {
  name: string
  active: number
  total: number
  mrr: number
}

const fmtMoney = (n: number) =>
  n >= 1000
    ? `$${(n / 1000).toFixed(1)}k`
    : `$${n.toFixed(0)}`

export function RevenueByPlan({ plans, totalMrr }: { plans: PlanStat[]; totalMrr: number }) {
  const [expanded, setExpanded] = useState(false)
  const sorted = [...plans].sort((a, b) => b.mrr - a.mrr)
  const TOP_COUNT = 3
  const hasMore = sorted.length > TOP_COUNT
  const visible = expanded ? sorted : sorted.slice(0, TOP_COUNT)

  return (
    <div className="admin-card mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Revenue by Plan</h3>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? 'Show less' : `+${sorted.length - TOP_COUNT} more`}
            <svg
              className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {visible.map(plan => (
          <div key={plan.name} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
            <div>
              <div className="text-sm font-medium text-gray-800">{plan.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {plan.active} active / {plan.total} total
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-green-600">{fmtMoney(plan.mrr)}/mo</div>
              {plan.active > 0 && (
                <div className="w-16 h-1.5 rounded-full bg-gray-200 mt-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500"
                    style={{ width: `${totalMrr > 0 ? (plan.mrr / totalMrr) * 100 : 0}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
