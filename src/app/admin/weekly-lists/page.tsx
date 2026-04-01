import type { Metadata } from 'next'
import Link from 'next/link'
import { getProductionWeeks } from '@/lib/queries'
import { SnapshotButton } from './SnapshotButton'
import { BackfillButton } from './BackfillButton'
import { SendDigestButton } from './SendDigestButton'
import { WeeklyListsTable } from './WeeklyListsTable'

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
  const currentWeekEntry = weeks.find((w) => w.monday === currentMonday)

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

      {/* Weekly Digest Email */}
      <SendDigestButton currentWeekCount={currentWeekEntry?.count ?? 0} />

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6 text-sm text-blue-800">
        <strong>How it works:</strong> Productions are automatically added to the current week when saved.
        Use &ldquo;Snapshot This Week&rdquo; to add all productions created/updated this week to the current list.
      </div>

      <WeeklyListsTable weeks={weeks} currentMonday={currentMonday} />
    </div>
  )
}
