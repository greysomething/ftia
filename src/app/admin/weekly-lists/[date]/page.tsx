import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { RemoveFromWeekButton } from './RemoveButton'
import { AddProductionForm } from './AddProductionForm'
import { SupplementButton } from './SupplementButton'

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
    .select('id, production_id, is_supplement')
    .eq('week_monday', date)

  // Build lookup maps
  const entryByProductionId: Record<number, number> = {}
  const supplementSet = new Set<number>()
  const productionIds: number[] = []

  if (!entriesError && entries && entries.length > 0) {
    for (const e of entries) {
      entryByProductionId[e.production_id] = e.id
      productionIds.push(e.production_id)
      if (e.is_supplement) supplementSet.add(e.production_id)
    }
  }

  let allProductions: any[] = []
  let usingFallback = false

  if (productionIds.length > 0) {
    const { data } = await supabase
      .from('productions')
      .select('id, title, slug, visibility, computed_status, wp_updated_at, production_date_start')
      .in('id', productionIds)
      .order('title')
    allProductions = data ?? []
  } else {
    // Fallback: use wp_updated_at date range
    usingFallback = true
    const { data } = await supabase
      .from('productions')
      .select('id, title, slug, visibility, computed_status, wp_updated_at, production_date_start')
      .eq('visibility', 'publish')
      .gte('wp_updated_at', mondayDate.toISOString())
      .lt('wp_updated_at', nextMonday.toISOString())
      .order('title')
    allProductions = data ?? []
  }

  // Split into admin-curated vs supplements
  const adminProductions = allProductions.filter(p => !supplementSet.has(p.id))
  const supplementProductions = allProductions.filter(p => supplementSet.has(p.id))
  const totalCount = allProductions.length

  function ProductionRow({ p, showFilmingDate = false }: { p: any; showFilmingDate?: boolean }) {
    return (
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
          {showFilmingDate && p.production_date_start
            ? formatDate(p.production_date_start)
            : formatDate(p.wp_updated_at)}
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
    )
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
            {fmt(mondayDate)} &ndash; {fmt(sundayDate)} &middot; {totalCount} productions
            {supplementProductions.length > 0 && (
              <span className="text-gray-400">
                {' '}({adminProductions.length} new + {supplementProductions.length} supplements)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SupplementButton weekMonday={date} currentCount={totalCount} />
          <Link
            href={`/productions/week/${date}`}
            target="_blank"
            className="btn-outline"
          >
            View Public Page
          </Link>
        </div>
      </div>

      {usingFallback && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 mb-6 text-sm text-yellow-800">
          <strong>Note:</strong> This week&apos;s list is based on production update dates (legacy data).
          Use &ldquo;Snapshot This Week&rdquo; on the Weekly Lists page to create explicit entries.
        </div>
      )}

      {/* Progress bar toward 40 target */}
      <div className="admin-card mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">List Progress</span>
          <span className="text-sm text-gray-500">{totalCount} / 40 target</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full transition-all ${totalCount >= 40 ? 'bg-green-500' : totalCount >= 20 ? 'bg-yellow-500' : 'bg-red-400'}`}
            style={{ width: `${Math.min(100, (totalCount / 40) * 100)}%` }}
          />
        </div>
      </div>

      {/* Add production */}
      <div className="admin-card mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Add Production to This Week</h2>
        <AddProductionForm weekMonday={date} />
      </div>

      {/* ── Admin-Curated Productions ── */}
      <div className="admin-card p-0 overflow-hidden mb-6">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span className="text-sm font-semibold text-gray-700">
              New Productions
            </span>
            <span className="text-xs text-gray-400">({adminProductions.length} added by admin)</span>
          </div>
        </div>
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
            {adminProductions.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-gray-400 py-8">
                  No admin-curated productions yet. Add productions above or use the AI Scanner in production edit.
                </td>
              </tr>
            ) : adminProductions.map((p: any) => (
              <ProductionRow key={p.id} p={p} />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Supplemental Productions ── */}
      {supplementProductions.length > 0 && (
        <div className="admin-card p-0 overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-sm font-semibold text-amber-800">
                Supplemental Productions
              </span>
              <span className="text-xs text-amber-600">
                ({supplementProductions.length} auto-added from older lists, still in production)
              </span>
            </div>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Status</th>
                <th>Filming Start</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {supplementProductions.map((p: any) => (
                <ProductionRow key={p.id} p={p} showFilmingDate />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
