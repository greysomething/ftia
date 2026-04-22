/**
 * Colored score pill for profile-completeness on admin list + edit pages.
 *
 * - Green:  75–100   (profile is in good shape)
 * - Amber:  40–74    (workable, but gaps worth filling)
 * - Red:   <40       (skeletal; prime candidate for AI enrichment)
 *
 * Hovering reveals which fields are still missing — useful for admins
 * deciding whether to manually enhance vs wait for the nightly cron.
 */

import type { CompletenessResult } from '@/lib/completeness'

export function CompletenessPill({ result, size = 'sm' }: {
  result: CompletenessResult
  size?: 'sm' | 'md'
}) {
  const palette: Record<CompletenessResult['bucket'], string> = {
    green: 'bg-green-50 border-green-200 text-green-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    red:   'bg-red-50 border-red-200 text-red-700',
  }
  const sizing = size === 'md'
    ? 'text-sm px-2.5 py-1'
    : 'text-xs px-2 py-0.5'

  const title = result.missing.length > 0
    ? `Missing: ${result.missing.join(', ')}`
    : 'All tracked fields present'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium tabular-nums ${palette[result.bucket]} ${sizing}`}
      title={title}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${
        result.bucket === 'green' ? 'bg-green-500'
        : result.bucket === 'amber' ? 'bg-amber-500'
        : 'bg-red-500'
      }`} />
      {result.score}%
    </span>
  )
}
