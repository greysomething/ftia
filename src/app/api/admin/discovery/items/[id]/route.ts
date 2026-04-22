/**
 * Per-item admin actions:
 *   POST   action=extract          — force run extractor now on a 'new' or 'error' item
 *   POST   action=skip             — mark as not-a-production (status='skipped')
 *   POST   action=create-anyway    — even if flagged duplicate, create a draft production
 *   DELETE                         — remove the item entirely (from queue)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { extractProductionFromArticle } from '@/lib/discovery/extractor'
import { createDraftFromExtraction } from '@/lib/discovery/draft-creator'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: idStr } = await ctx.params
  const id = Number(idStr)
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const action = req.nextUrl.searchParams.get('action') ?? 'extract'
  const supabase = createAdminClient()

  const { data: item, error } = await supabase
    .from('discovery_items').select('*, discovery_sources(name)').eq('id', id).single()
  if (error || !item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  if (action === 'skip') {
    await supabase.from('discovery_items').update({
      status: 'skipped', processed_at: new Date().toISOString(),
    }).eq('id', id)
    return NextResponse.json({ ok: true, status: 'skipped' })
  }

  if (action === 'create-anyway') {
    // Accept an existing extraction (if any) or re-extract then create a draft unconditionally
    let extracted = (item as any).extraction_data
    if (!extracted || !extracted.title) {
      const apiKey = process.env.SCANNER_ANTHROPIC_KEY
      if (!apiKey) return NextResponse.json({ error: 'SCANNER_ANTHROPIC_KEY not configured' }, { status: 500 })
      const result = await extractProductionFromArticle(apiKey, {
        title: (item as any).title, link: (item as any).link, summary: (item as any).summary,
      })
      if (!result) return NextResponse.json({ error: 'Could not extract — article does not appear to be a production announcement' }, { status: 400 })
      extracted = result
    }
    // Admin chose "Create anyway" — bypass slug-collision dedup
    const result = await createDraftFromExtraction(supabase, extracted, {
      sourceLink: (item as any).link,
      sourceName: ((item as any).discovery_sources as any)?.name ?? null,
    }, { forceCreate: true })
    if (!result.isNew) {
      // Should be unreachable with forceCreate, but defensive
      return NextResponse.json({ error: `Existing production #${result.duplicateOfId} blocked creation` }, { status: 409 })
    }
    await supabase.from('discovery_items').update({
      status: 'created',
      production_id: result.productionId,
      extraction_score: extracted.verifiability_score,
      extraction_data: extracted,
      duplicate_of: null,
      error: null,
      processed_at: new Date().toISOString(),
    }).eq('id', id)
    return NextResponse.json({ ok: true, productionId: result.productionId, slug: result.slug, status: 'created' })
  }

  // Default: extract
  const apiKey = process.env.SCANNER_ANTHROPIC_KEY
  if (!apiKey) return NextResponse.json({ error: 'SCANNER_ANTHROPIC_KEY not configured' }, { status: 500 })

  await supabase.from('discovery_items').update({ status: 'extracting' }).eq('id', id)
  try {
    const extracted = await extractProductionFromArticle(apiKey, {
      title: (item as any).title, link: (item as any).link, summary: (item as any).summary,
    })
    if (!extracted) {
      await supabase.from('discovery_items').update({
        status: 'filtered_out', processed_at: new Date().toISOString(),
      }).eq('id', id)
      return NextResponse.json({ ok: true, status: 'filtered_out' })
    }
    // Settings-driven threshold
    const { data: settingsRows } = await supabase.from('discovery_settings').select('key,value').in('key', ['extraction_threshold'])
    const threshold = parseInt((settingsRows ?? []).find(s => s.key === 'extraction_threshold')?.value || '85', 10)

    if (extracted.verifiability_score >= threshold) {
      const result = await createDraftFromExtraction(supabase, extracted, {
        sourceLink: (item as any).link,
        sourceName: ((item as any).discovery_sources as any)?.name ?? null,
      })
      if (!result.isNew) {
        // Slug-collision backstop fired — record as duplicate
        await supabase.from('discovery_items').update({
          status: 'duplicate',
          duplicate_of: result.duplicateOfId,
          extraction_score: extracted.verifiability_score,
          extraction_data: extracted,
          processed_at: new Date().toISOString(),
          error: `Slug match: existing production #${result.duplicateOfId} "${result.existingTitle}" has the same slug`,
        }).eq('id', id)
        return NextResponse.json({ ok: true, status: 'duplicate', duplicateOf: result.duplicateOfId, existingTitle: result.existingTitle, score: extracted.verifiability_score })
      }
      await supabase.from('discovery_items').update({
        status: 'created',
        production_id: result.productionId,
        extraction_score: extracted.verifiability_score,
        extraction_data: extracted,
        processed_at: new Date().toISOString(),
      }).eq('id', id)
      return NextResponse.json({ ok: true, status: 'created', productionId: result.productionId, slug: result.slug, score: extracted.verifiability_score })
    } else {
      await supabase.from('discovery_items').update({
        status: 'extracted',
        extraction_score: extracted.verifiability_score,
        extraction_data: extracted,
        processed_at: new Date().toISOString(),
      }).eq('id', id)
      return NextResponse.json({ ok: true, status: 'extracted', score: extracted.verifiability_score })
    }
  } catch (err: any) {
    await supabase.from('discovery_items').update({
      status: 'error', error: err.message?.slice(0, 500), processed_at: new Date().toISOString(),
    }).eq('id', id)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: idStr } = await ctx.params
  const id = Number(idStr)
  const supabase = createAdminClient()
  const { error } = await supabase.from('discovery_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
