import type { Metadata } from 'next'
import Link from 'next/link'
import { getProductionWeeks } from '@/lib/queries'
import { SnapshotButton } from './SnapshotButton'
import { BackfillButton } from './BackfillButton'

export const metadata: Metadata = { title: 'Weekly Lists' }

export default async function AdminWeeklyListsPage() {
  const weeks = await getProductionWeeks()

  // Calculate current week's Monday for highlighting
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  const currentMonday = monday.toISOString().split('T')[0]

  const totalProductions = weeks.reduce((sum, w) => sum + w.count, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Weekly Lists</h1>
          <p className="text-sm text-gray-500 mt-1">
            {weeks.length} weeks &middot; {totalProductions.toLocaleString()} total entries
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BackfillButton />
          <SnapshotButton />
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6 text-sm text-blue-800">
        <strong>How it works:</strong> Productions are automatically added to the current week when saved.
        Use &ldquo;Snapshot This Week&rdquo; to bulk-add all published productions to the current week&rsquo;s list.
      </div>

      <div className="admin-card p-0 overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Week</th>
              <th>Date Range</th>
              <th className="text-center">Productions</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {weeks.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-gray-400 py-10">
                  No weekly lists yet. Save a production or use &ldquo;Snapshot This Week&rdquo; to get started.
                </td>
              </tr>
            ) : weeks.map((w) => {
              const mondayDate = new Date(w.monday + 'T00:00:00')
              const sundayDate = new Date(mondayDate)
              sundayDate.setDate(mondayDate.getDate() + 6)
              const isCurrentWeek = w.monday === currentMonday

              const fmt = (d: Date) => d.toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })

              return (
                <tr key={w.monday} className={isCurrentWeek ? 'bg-blue-50/50' : ''}>
                  <td>
                    <span className="font-medium text-gray-900">
                      {mondayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {isCurrentWeek && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 uppercase">
                        Current
                      </span>
                    )}
                  </td>
                  <td className="text-gray-500 text-sm">
                    {fmt(mondayDate)} &ndash; {fmt(sundayDate)}
                  </td>
                  <td className="text-center">
                    <span className={`inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-semibold ${
                      w.count < 40 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {w.count}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/weekly-lists/${w.monday}`}
                        className="text-xs btn-primary py-1 px-2"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/productions/week/${w.monday}`}
                        target="_blank"
                        className="text-xs btn-outline py-1 px-2"
                      >
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
