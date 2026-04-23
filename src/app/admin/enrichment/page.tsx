import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getEnrichmentSettings } from '@/lib/enrichment-settings'
import {
  getEnrichmentDailySummary,
  getEnrichmentTotals,
  getRecentEnrichmentRuns,
} from '@/lib/enrichment-queries'
import { EnrichmentDashboard } from '@/components/admin/EnrichmentDashboard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Profile Enrichment — Admin' }

export default async function EnrichmentAdminPage() {
  await requireAdmin()
  const supabase = createAdminClient()

  const [settings, totals, daily, recent] = await Promise.all([
    getEnrichmentSettings(),
    getEnrichmentTotals(supabase),
    getEnrichmentDailySummary(supabase, 30),
    getRecentEnrichmentRuns(supabase, 30),
  ])

  return (
    <EnrichmentDashboard
      initialSettings={settings}
      totals={totals}
      daily={daily}
      recent={recent.slice(0, 100)}
    />
  )
}
