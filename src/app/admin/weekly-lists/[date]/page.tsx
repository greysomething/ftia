import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { RemoveFromWeekButton } from './RemoveButton'
import { AddProductionForm } from './AddProductionForm'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ date: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params
  return { title: `Weekly List — ${date}` }
}

export default async function AdminWeekDetailPage({ params }: Props) {
  const { date } = await params
  const mondayDate = new Date(date + 'T00:00:00')
  const sundayDate = new Date(mondayDate)
  sundayDate.setDate(mondayDate.getDate() + 6)
  const nextMonday = new Date(mondayDate)
  nextMonday.setDate(mondayDate.getDate() + 7)

  const fmt = (d: Date) => d.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  const supabase = createAdminClient()

  // Try production_week_entries table first
  const { data: entries, error: entriesError } = await (supabase as any)
    .from('production_week_entries')
    .select('id, production_id')
    .eq('week_monday', date)

  const entryByProductionId: Record<number, number> = {}
  const productionIds: number[] = []

  if (!entriesError && entries && entries.length > 0) {
    for (const e of entries) {
      entryByProductionId[e.production_id] = e.id
      productionIds.push(e.production_id)
    }
  }

  let productions: any[] = []
  let usingFallback = false

  if (productionIds.length > 0) {
    // Fetch productions from the week_entries table
    const { data } = await supabase
      .from('productions')
      .select('id, title, slug, visibility, computed_status, wp_updated_at')
      .in('id', productionIds)
      .order('title')
    productions = data ?? []
  } else {
    // Fallback: use wp_updated_at date range (same logic as getProductionWeeks index)
    usingFallback = true
    const { data } = await supabase
      .from('productions')
      .select('id, title, slug, visibility, computed_status, wp_updated_at')
      .eq('visibility', 'publish')
      .gte('wp_updated_at', mondayDate.toISOString())
      .lt('wp_updated_at', nextMonday.toISOString())
      .order('title')
    productions = data ?? []
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/admin/weekly-lists" className="text-sm text-gray-500 hover:text-primary mb-1 inline-flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Weekly Lists
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            Week of {fmt(mondayDate)}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {fmt(mondayDate)} &ndash; {fmt(sundayDate)} &middot; {productions.length} productions
          </p>
        </div>
        <Link
          href={`/productions/week/${date}`}
          target="_blank"
          className="btn-outline"
        >
          View Public Page
        </Link>
      </div>

      {usingFallback && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 mb-6 text-sm text-yellow-800">
          <strong>Note:</strong> This week&apos;s list is based on production update dates (legacy data).
          Use &ldquo;Snapshot This Week&rdquo; on the Weekly Lists page to create explicit entries.
        </div>
      )}

      {/* Add production */}
      <div className="admin-card mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Add Production to This Week</h2>
        <AddProductionForm weekMonday={date} />
      </div>

      {/* Productions list */}
      <div className="admin-card p-0 overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Status</th>
              <th>Updated</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {productions.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-gray-400 py-10">
                  No productions in this week&apos;s list.
                </td>
              </tr>
            ) : productions.map((p: any) => (
              <tr key={p.id}>
                <td className="text-gray-400 text-xs w-16">{p.id}</td>
                <td>
                  <Link href={`/admin/productions/${p.id}/edit`} className="font-medium text-primary hover:underline">
                    {p.title}
                  </Link>
                </td>
                <td>
                  <span className={`badge ${p.visibility === 'publish' ? 'badge-green' : 'badge-gray'}`}>
                    {p.visibility === 'publish' ? 'Published' : p.visibility}
                  </span>
                </td>
                <td className="text-xs text-gray-500 whitespace-nowrap">
                  {formatDate(p.wp_updated_at)}
                </td>
                <td className="text-right">
                  {entryByProductionId[p.id] ? (
                    <RemoveFromWeekButton
                      entryId={entryByProductionId[p.id]}
                      weekMonday={date}
                    />
                  ) : usingFallback ? (
                    <span className="text-xs text-gray-400">Legacy</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
