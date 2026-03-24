import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/admin/fix-migration
 *
 * Fixes two migration issues:
 * 1. Publishes all draft productions (they were incorrectly imported as drafts)
 * 2. Resolves [Company WP#XXXX] and [Crew WP#XXXX] placeholders to actual
 *    company_id / crew_id references with real names
 *
 * Body: { action: 'publish-drafts' | 'resolve-companies' | 'resolve-crew' | 'all' }
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { action = 'all' } = await req.json().catch(() => ({ action: 'all' }))
  const supabase = createAdminClient()
  const results: Record<string, any> = {}

  // ── Step 1: Publish all drafts ──
  if (action === 'publish-drafts' || action === 'all') {
    const { count: beforeCount } = await supabase
      .from('productions')
      .select('*', { count: 'exact', head: true })
      .eq('visibility', 'draft')

    const { error } = await supabase
      .from('productions')
      .update({ visibility: 'publish' })
      .eq('visibility', 'draft')

    results.publishDrafts = error
      ? { error: error.message }
      : { published: beforeCount, message: `Published ${beforeCount} draft productions.` }
  }

  // ── Step 2: Resolve company placeholders ──
  if (action === 'resolve-companies' || action === 'all') {
    // Build wp_id → { id, title } lookup for all companies
    const companyMap: Record<number, { id: number; title: string }> = {}
    let cPage = 0
    while (true) {
      const { data } = await supabase
        .from('companies')
        .select('id, wp_id, title')
        .not('wp_id', 'is', null)
        .range(cPage * 1000, cPage * 1000 + 999)
      if (!data || data.length === 0) break
      for (const c of data) {
        if (c.wp_id) companyMap[c.wp_id] = { id: c.id, title: c.title }
      }
      if (data.length < 1000) break
      cPage++
    }

    // Fetch all company links with WP# placeholders (paginate)
    let resolved = 0
    let unresolved = 0
    let linkPage = 0
    while (true) {
      const { data: links } = await (supabase as any)
        .from('production_company_links')
        .select('id, inline_name')
        .like('inline_name', '%WP#%')
        .range(linkPage * 500, linkPage * 500 + 499)

      if (!links || links.length === 0) break

      for (const link of links) {
        const match = link.inline_name.match(/WP#(\d+)/)
        if (!match) continue
        const wpId = parseInt(match[1])
        const company = companyMap[wpId]
        if (company) {
          await supabase
            .from('production_company_links')
            .update({ company_id: company.id, inline_name: company.title })
            .eq('id', link.id)
          resolved++
        } else {
          unresolved++
        }
      }

      if (links.length < 500) break
      linkPage++
    }

    results.resolveCompanies = {
      resolved,
      unresolved,
      message: `Resolved ${resolved} company placeholders. ${unresolved} could not be matched.`,
    }
  }

  // ── Step 3: Resolve crew placeholders ──
  if (action === 'resolve-crew' || action === 'all') {
    // Build wp_id → { id, name } lookup for all crew
    const crewMap: Record<number, { id: number; name: string }> = {}
    let crPage = 0
    while (true) {
      const { data } = await supabase
        .from('crew_members')
        .select('id, wp_id, name')
        .not('wp_id', 'is', null)
        .range(crPage * 1000, crPage * 1000 + 999)
      if (!data || data.length === 0) break
      for (const c of data) {
        if (c.wp_id) crewMap[c.wp_id] = { id: c.id, name: c.name }
      }
      if (data.length < 1000) break
      crPage++
    }

    // Fetch all crew links with WP# placeholders (paginate)
    let resolved = 0
    let unresolved = 0
    let linkPage = 0
    while (true) {
      const { data: links } = await (supabase as any)
        .from('production_crew_roles')
        .select('id, inline_name')
        .like('inline_name', '%WP#%')
        .range(linkPage * 500, linkPage * 500 + 499)

      if (!links || links.length === 0) break

      for (const link of links) {
        const match = link.inline_name.match(/WP#(\d+)/)
        if (!match) continue
        const wpId = parseInt(match[1])
        const crew = crewMap[wpId]
        if (crew) {
          await supabase
            .from('production_crew_roles')
            .update({ crew_id: crew.id, inline_name: crew.name })
            .eq('id', link.id)
          resolved++
        } else {
          unresolved++
        }
      }

      if (links.length < 500) break
      linkPage++
    }

    results.resolveCrew = {
      resolved,
      unresolved,
      message: `Resolved ${resolved} crew placeholders. ${unresolved} could not be matched.`,
    }
  }

  // ── Step 4: Add newly published productions to weekly entries ──
  if (action === 'publish-drafts' || action === 'all') {
    // The newly published productions need week entries too
    const { data: newPubs } = await supabase
      .from('productions')
      .select('id, wp_updated_at, wp_created_at, created_at')
      .eq('visibility', 'publish')

    if (newPubs && newPubs.length > 0) {
      // Check which ones DON'T have week entries yet
      const existingIds = new Set<number>()
      let ePage = 0
      while (true) {
        const { data } = await (supabase as any)
          .from('production_week_entries')
          .select('production_id')
          .range(ePage * 1000, ePage * 1000 + 999)
        if (!data || data.length === 0) break
        for (const e of data) existingIds.add(e.production_id)
        if (data.length < 1000) break
        ePage++
      }

      const missingEntries = newPubs
        .filter(p => !existingIds.has(p.id))
        .map(p => {
          const dateStr = p.wp_updated_at || p.wp_created_at || p.created_at
          const d = new Date(dateStr)
          const day = d.getUTCDay()
          const diff = day === 0 ? -6 : 1 - day
          const monday = new Date(d)
          monday.setUTCDate(d.getUTCDate() + diff)
          return {
            production_id: p.id,
            week_monday: monday.toISOString().split('T')[0],
          }
        })

      // Batch insert
      let weekAdded = 0
      for (let i = 0; i < missingEntries.length; i += 500) {
        const chunk = missingEntries.slice(i, i + 500)
        const { error } = await (supabase as any)
          .from('production_week_entries')
          .upsert(chunk, { onConflict: 'production_id,week_monday' })
        if (!error) weekAdded += chunk.length
      }

      results.weekEntries = {
        added: weekAdded,
        message: `Added ${weekAdded} weekly list entries for newly published productions.`,
      }
    }
  }

  return NextResponse.json({ ok: true, results })
}
