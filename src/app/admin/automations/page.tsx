import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { AUTOMATIONS, nextCronTime, formatRelativeTime } from '@/lib/automations'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Automations — Admin' }

export default async function AutomationsHubPage() {
  await requireAdmin()
  const supabase = createAdminClient()

  // Resolve every status in parallel — slow ones don't block the others.
  const statuses = await Promise.all(
    AUTOMATIONS.map(async (a) => {
      try {
        const status = await a.getStatus(supabase)
        const next = nextCronTime(a.cron)
        return { def: a, status, next, error: null as string | null }
      } catch (err: any) {
        return { def: a, status: null, next: null, error: err?.message ?? 'status fetch failed' }
      }
    }),
  )

  const errorCount = statuses.filter(s => s.status?.last_run_outcome === 'error').length
  const partialCount = statuses.filter(s => s.status?.last_run_outcome === 'partial').length
  const disabledCount = statuses.filter(s => s.status?.enabled === false).length

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Automations</h1>
        <p className="text-sm text-gray-500 mt-1">
          Status board for every scheduled task. All times shown in your local timezone;
          schedules in vercel.json are UTC.
        </p>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Kpi label="Total automations" value={AUTOMATIONS.length} />
        <Kpi label="Errors (last run)" value={errorCount} tone={errorCount > 0 ? 'red' : 'gray'} />
        <Kpi label="Partial failures" value={partialCount} tone={partialCount > 0 ? 'amber' : 'gray'} />
        <Kpi label="Disabled" value={disabledCount} tone={disabledCount > 0 ? 'amber' : 'gray'} />
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {statuses.map(({ def, status, next, error }) => (
          <div
            key={def.id}
            className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold text-gray-900">{def.name}</h2>
                  <CategoryBadge category={def.category} />
                  {status?.enabled === false && <Pill tone="amber">Paused</Pill>}
                  {status?.enabled === null && <Pill tone="gray">Always-on</Pill>}
                </div>
                <p className="text-sm text-gray-600 mt-1">{def.description}</p>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                  <Row
                    label="Schedule"
                    value={
                      <>
                        <code className="text-[11px] bg-gray-100 px-1.5 py-0.5 rounded">{def.cron}</code>
                        {def.cron_pacific_hint && (
                          <span className="ml-2 text-gray-500">{def.cron_pacific_hint}</span>
                        )}
                      </>
                    }
                  />
                  <Row
                    label="Next run"
                    value={next ? `${formatDate(next.toISOString())} (${formatRelativeTime(next.toISOString())})` : 'Unknown'}
                  />
                  <Row
                    label="Last run"
                    value={
                      error ? <span className="text-red-600">Status query failed: {error}</span> :
                      status?.last_run_at ? `${formatDate(status.last_run_at)} (${formatRelativeTime(status.last_run_at)})` :
                      <span className="text-gray-400 italic">Never</span>
                    }
                  />
                  <Row
                    label="Outcome"
                    value={<OutcomePill outcome={status?.last_run_outcome ?? null} />}
                  />
                  {status?.last_run_summary && (
                    <Row label="Summary" value={<span className="text-gray-700">{status.last_run_summary}</span>} colSpan={2} />
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-1.5 items-end">
                {def.dashboard_path && (
                  <Link
                    href={def.dashboard_path}
                    className="text-xs bg-[#3ea8c8] text-white px-3 py-1.5 rounded-md font-medium hover:bg-[#2e8aa8] whitespace-nowrap"
                  >
                    Open dashboard
                  </Link>
                )}
                {def.settings_path && def.settings_path !== def.dashboard_path && (
                  <Link
                    href={def.settings_path}
                    className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md font-medium hover:bg-gray-50 whitespace-nowrap"
                  >
                    Settings
                  </Link>
                )}
                <code className="text-[10px] text-gray-400 mt-1">{def.api_path}</code>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 text-xs text-gray-400">
        Adding a new automation? Register it in <code>src/lib/automations.ts</code> and it'll appear here automatically.
      </div>
    </div>
  )
}

function Kpi({ label, value, tone = 'gray' }: { label: string; value: number; tone?: 'gray' | 'red' | 'amber' | 'green' }) {
  const cls = { gray: 'text-gray-900', red: 'text-red-600', amber: 'text-amber-600', green: 'text-green-600' }[tone]
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${cls}`}>{value}</div>
    </div>
  )
}

function Row({ label, value, colSpan }: { label: string; value: React.ReactNode; colSpan?: number }) {
  return (
    <div className={colSpan === 2 ? 'md:col-span-2' : ''}>
      <span className="text-gray-500">{label}:</span>{' '}
      <span>{value}</span>
    </div>
  )
}

function Pill({ tone, children }: { tone: 'gray' | 'red' | 'amber' | 'green'; children: React.ReactNode }) {
  const cls = {
    gray: 'bg-gray-100 text-gray-600',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-green-50 text-green-700',
  }[tone]
  return <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{children}</span>
}

function CategoryBadge({ category }: { category: 'content' | 'discovery' | 'enrichment' | 'email' }) {
  const colors: Record<string, string> = {
    content:    'bg-purple-50 text-purple-700',
    discovery:  'bg-blue-50 text-blue-700',
    enrichment: 'bg-emerald-50 text-emerald-700',
    email:      'bg-amber-50 text-amber-700',
  }
  return <span className={`text-xs px-2 py-0.5 rounded ${colors[category]}`}>{category}</span>
}

function OutcomePill({ outcome }: { outcome: 'ok' | 'skipped' | 'error' | 'partial' | null }) {
  if (!outcome) return <span className="text-gray-400 italic text-xs">—</span>
  const tone = { ok: 'green', error: 'red', partial: 'amber', skipped: 'gray' }[outcome] as 'green' | 'red' | 'amber' | 'gray'
  return <Pill tone={tone}>{outcome}</Pill>
}
