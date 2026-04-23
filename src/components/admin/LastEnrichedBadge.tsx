'use client'

interface Props {
  lastEnrichedAt?: string | null
}

/**
 * Small badge shown next to the AI Research button telling the admin when
 * this record was last enriched. Helps avoid wasteful re-runs and pairs
 * with the future cron's 30-day skip window.
 */
export function LastEnrichedBadge({ lastEnrichedAt }: Props) {
  if (!lastEnrichedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
        Never enriched
      </span>
    )
  }

  const ts = new Date(lastEnrichedAt)
  if (isNaN(ts.getTime())) return null

  const diffMs = Date.now() - ts.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffMins = Math.floor(diffMs / 60000)

  let label: string
  if (diffMins < 1) label = 'just now'
  else if (diffMins < 60) label = `${diffMins} min ago`
  else if (diffHours < 24) label = `${diffHours}h ago`
  else if (diffDays < 30) label = `${diffDays}d ago`
  else label = `${Math.floor(diffDays / 30)}mo ago`

  // Green if very fresh (<30 days, the cron's skip window), gray otherwise.
  const fresh = diffDays < 30
  const colorClass = fresh
    ? 'text-green-700 bg-green-50 border-green-200'
    : 'text-gray-500 bg-gray-50 border-gray-200'

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium border px-2 py-0.5 rounded ${colorClass}`}
      title={`Last enriched: ${ts.toLocaleString()}`}
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Last enriched: {label}
    </span>
  )
}
