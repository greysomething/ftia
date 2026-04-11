import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { ProductionSubmission } from '@/types/database'

const DAILY_SUBMISSION_CAP = 3

// ── User-facing queries (RLS-enforced) ────────────────────────────

/**
 * Get submissions for the current logged-in user.
 * Uses the RLS-aware client so users can only see their own rows.
 */
export async function getMySubmissions(
  userId: string,
  opts?: { status?: string; page?: number; perPage?: number }
) {
  const supabase = await createClient()
  const page = opts?.page ?? 1
  const perPage = opts?.perPage ?? 20
  const offset = (page - 1) * perPage

  let query = supabase
    .from('production_submissions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .range(offset, offset + perPage - 1)

  if (opts?.status && opts.status !== 'all') {
    query = query.eq('status', opts.status)
  }

  const { data, count, error } = await query

  return {
    submissions: (data ?? []) as ProductionSubmission[],
    total: count ?? 0,
    perPage,
    error,
  }
}

export async function getMySubmissionCounts(userId: string) {
  const supabase = await createClient()

  const queries = ['draft', 'pending', 'approved', 'rejected'].map(async (status) => {
    const { count } = await supabase
      .from('production_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', status)
    return { status, count: count ?? 0 }
  })

  const results = await Promise.all(queries)
  const counts: Record<string, number> = { all: 0 }
  for (const r of results) {
    counts[r.status] = r.count
    counts.all += r.count
  }
  return counts
}

/**
 * Get a single submission by ID. RLS ensures user can only read their own.
 */
export async function getMySubmission(submissionId: number) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('production_submissions')
    .select('*')
    .eq('id', submissionId)
    .single()

  return { submission: data as ProductionSubmission | null, error }
}

/**
 * Check how many non-draft submissions the user has made in the last 24h.
 * Returns { allowed: boolean, remaining: number, resetInHours: number }
 */
export async function checkSubmissionRateLimit(userId: string) {
  const supabase = createAdminClient()
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { count } = await supabase
    .from('production_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['pending', 'approved', 'rejected'])
    .gte('submitted_at', twentyFourHoursAgo)

  const used = count ?? 0
  const remaining = Math.max(0, DAILY_SUBMISSION_CAP - used)

  // Find earliest submission in window to compute reset time
  let resetInHours = 0
  if (remaining === 0) {
    const { data: oldest } = await supabase
      .from('production_submissions')
      .select('submitted_at')
      .eq('user_id', userId)
      .in('status', ['pending', 'approved', 'rejected'])
      .gte('submitted_at', twentyFourHoursAgo)
      .order('submitted_at', { ascending: true })
      .limit(1)

    if (oldest?.[0]?.submitted_at) {
      const resetAt = new Date(oldest[0].submitted_at).getTime() + 24 * 60 * 60 * 1000
      resetInHours = Math.max(0, Math.ceil((resetAt - Date.now()) / (60 * 60 * 1000)))
    }
  }

  return {
    allowed: remaining > 0,
    remaining,
    used,
    cap: DAILY_SUBMISSION_CAP,
    resetInHours,
  }
}

// ── Admin queries (service-role, bypasses RLS) ────────────────────

/**
 * Get all submissions for admin review.
 */
export async function getAdminSubmissions(
  opts?: { status?: string; page?: number; perPage?: number }
) {
  const supabase = createAdminClient()
  const page = opts?.page ?? 1
  const perPage = opts?.perPage ?? 20
  const offset = (page - 1) * perPage

  let query = supabase
    .from('production_submissions')
    .select('*', { count: 'exact' })
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + perPage - 1)

  if (opts?.status && opts.status !== 'all') {
    query = query.eq('status', opts.status)
  } else {
    // Default admin view: show pending first, then everything else
    query = query.order('status', { ascending: true })
  }

  const { data, count, error } = await query

  return {
    submissions: (data ?? []) as ProductionSubmission[],
    total: count ?? 0,
    perPage,
    error,
  }
}

/**
 * Get a single submission by ID for admin review (bypasses RLS).
 */
export async function getAdminSubmission(submissionId: number) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('production_submissions')
    .select('*')
    .eq('id', submissionId)
    .single()

  return { submission: data as ProductionSubmission | null, error }
}

/**
 * Get pending submission count for admin badge.
 */
export async function getPendingSubmissionCount(): Promise<number> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('production_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  return count ?? 0
}

/**
 * Fetch existing production types and statuses for autocomplete.
 */
export async function getProductionTypeAndStatusOptions() {
  const supabase = createAdminClient()

  const [{ data: types }, { data: statuses }] = await Promise.all([
    supabase.from('production_types').select('name, slug').order('name'),
    supabase.from('production_statuses').select('name, slug').order('name'),
  ])

  return {
    types: (types ?? []).map((t: any) => t.name as string),
    statuses: (statuses ?? []).map((s: any) => s.name as string),
  }
}
