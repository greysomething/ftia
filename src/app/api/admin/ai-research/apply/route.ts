import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { parsePhpSerialized } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * Auto-apply high-confidence AI research findings directly to a company / crew row.
 *
 * Rules:
 *   1. A field is eligible only when its `field_metadata[field].confidence >= MIN_CONFIDENCE`.
 *   2. A field is auto-applied only when the corresponding DB column is currently empty —
 *      we never overwrite admin-curated values.
 *   3. Stamps `last_enriched_at = now()` regardless of how many fields were applied,
 *      so the future cron knows the record was visited.
 *
 * Returns: { applied: {field: value}, skipped_existing: [field], low_confidence: [field],
 *           needs_review: { field: { value, confidence, sources, reasoning } } }
 */

const MIN_CONFIDENCE = 0.85

// AI field name → { dbColumn, isArray, isExistingArray }
// `isArray` means the DB column is a Postgres text[] and we wrap the AI string into [value].
type FieldMap = Record<
  string,
  { col: string; isArray?: boolean }
>

const COMPANY_FIELD_MAP: FieldMap = {
  address:     { col: 'addresses', isArray: true },
  phone:       { col: 'phones',    isArray: true },
  email:       { col: 'emails',    isArray: true },
  website:     { col: 'website' },
  linkedin:    { col: 'linkedin' },
  twitter:     { col: 'twitter' },
  instagram:   { col: 'instagram' },
  description: { col: 'content' },
}

const CREW_FIELD_MAP: FieldMap = {
  email:     { col: 'emails', isArray: true },
  phone:     { col: 'phones', isArray: true },
  website:   { col: 'website' },
  linkedin:  { col: 'linkedin' },
  twitter:   { col: 'twitter' },
  instagram: { col: 'instagram' },
  imdb:      { col: 'imdb' },
  bio:       { col: 'content' },
  location:  { col: 'location' },
  // known_for and representation are arrays/objects; auto-apply only when empty
  known_for:      { col: 'known_for' },
  representation: { col: 'representation' },
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) {
    if (value.length === 0) return true
    // PHP-serialized strings stored as a single element on the legacy WP rows
    const cleaned = parsePhpSerialized(value)
    return cleaned.length === 0 || cleaned.every(s => !s || !String(s).trim())
  }
  if (typeof value === 'object') return Object.keys(value as object).length === 0
  return false
}

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const { type, id, data } = body as { type?: 'company' | 'crew'; id?: number; data?: any }
  if (!type || (type !== 'company' && type !== 'crew')) {
    return NextResponse.json({ error: 'Invalid type (must be "company" or "crew")' }, { status: 400 })
  }
  if (!id || !Number.isFinite(Number(id))) {
    return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
  }
  if (!data || typeof data !== 'object') {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const table = type === 'company' ? 'companies' : 'crew_members'
  const fieldMap = type === 'company' ? COMPANY_FIELD_MAP : CREW_FIELD_MAP

  // Pull the current row so we can compare against it (don't overwrite curated values).
  const { data: current, error: loadErr } = await supabase
    .from(table)
    .select('*')
    .eq('id', Number(id))
    .single()
  if (loadErr || !current) {
    return NextResponse.json({ error: loadErr?.message ?? 'Record not found' }, { status: 404 })
  }

  const meta = (data.field_metadata ?? {}) as Record<string, { confidence?: number; sources?: any[]; reasoning?: string }>
  const applied: Record<string, any> = {}
  const skippedExisting: string[] = []
  const lowConfidence: string[] = []
  const needsReview: Record<string, { value: any; confidence: number; sources: any[]; reasoning: string }> = {}

  for (const [aiField, mapping] of Object.entries(fieldMap)) {
    const aiValue = data[aiField]
    if (aiValue == null || (Array.isArray(aiValue) && aiValue.length === 0)) continue
    if (typeof aiValue === 'string' && aiValue.trim() === '') continue

    const fieldMeta = meta[aiField] ?? {}
    const confidence = typeof fieldMeta.confidence === 'number' ? fieldMeta.confidence : 0

    const existing = current[mapping.col]
    const dbValue = mapping.isArray
      ? [String(aiValue).trim()]
      : (typeof aiValue === 'string' ? aiValue.trim() : aiValue)

    if (!isEmpty(existing)) {
      // Don't overwrite admin-curated values, but surface as suggestion if confident.
      if (confidence >= MIN_CONFIDENCE) {
        needsReview[aiField] = {
          value: aiValue,
          confidence,
          sources: fieldMeta.sources ?? [],
          reasoning: fieldMeta.reasoning ?? '',
        }
      }
      skippedExisting.push(aiField)
      continue
    }

    if (confidence >= MIN_CONFIDENCE) {
      applied[mapping.col] = dbValue
    } else {
      lowConfidence.push(aiField)
      needsReview[aiField] = {
        value: aiValue,
        confidence,
        sources: fieldMeta.sources ?? [],
        reasoning: fieldMeta.reasoning ?? '',
      }
    }
  }

  // Always stamp last_enriched_at so cron + UI know we visited.
  const updatePayload: Record<string, any> = { ...applied, last_enriched_at: new Date().toISOString() }

  const { error: updateErr } = await supabase
    .from(table)
    .update(updatePayload)
    .eq('id', Number(id))
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Refresh the relevant admin pages so the new values render.
  if (type === 'company') {
    revalidatePath('/admin/companies')
    revalidatePath(`/admin/companies/${id}/edit`)
    revalidatePath('/production-contact')
  } else {
    revalidatePath('/admin/crew')
    revalidatePath(`/admin/crew/${id}/edit`)
    revalidatePath('/production-role')
  }

  return NextResponse.json({
    ok: true,
    applied_count: Object.keys(applied).length,
    applied,
    skipped_existing: skippedExisting,
    low_confidence: lowConfidence,
    needs_review: needsReview,
    last_enriched_at: updatePayload.last_enriched_at,
  })
}
