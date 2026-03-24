'use client'

import { useState } from 'react'
import Link from 'next/link'

interface WeekData {
  monday: string
  count: number
  delta?: number
}

export function WeeklyArchive({ weeks }: { weeks: WeekData[] }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? weeks : weeks.slice(0, 12)

  function formatWeekDate(monday: string) {
    const d = new Date(monday + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 bg-gray-50/80 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Weekly Archive</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Week</th>
              <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Projects</th>
              <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Change</th>
              <th className="text-right px-5 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visible.map((week) => (
              <tr key={week.monday} className="hover:bg-gray-50/50 transition-colors group">
                <td className="px-5 py-3">
                  <span className="text-sm font-medium text-gray-800">{formatWeekDate(week.monday)}</span>
                </td>
                <td className="text-center px-3 py-3">
                  <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                    {week.count}
                  </span>
                </td>
                <td className="text-center px-3 py-3">
                  {week.delta !== undefined && week.delta !== 0 ? (
                    <span className={`text-xs font-semibold ${week.delta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {week.delta > 0 ? '+' : ''}{week.delta}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
                <td className="text-right px-5 py-3">
                  <Link
                    href={`/productions/week/${week.monday}`}
                    className="text-xs font-medium text-accent hover:text-accent-dark transition-colors opacity-60 group-hover:opacity-100"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {weeks.length > 12 && !showAll && (
        <div className="text-center mt-4">
          <button
            onClick={() => setShowAll(true)}
            className="text-sm font-medium text-accent hover:text-accent-dark transition-colors"
          >
            Show All {weeks.length} Weeks ↓
          </button>
        </div>
      )}
      {showAll && weeks.length > 12 && (
        <div className="text-center mt-4">
          <button
            onClick={() => setShowAll(false)}
            className="text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
          >
            Show Less ↑
          </button>
        </div>
      )}
    </div>
  )
}
