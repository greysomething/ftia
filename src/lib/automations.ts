/**
 * Single source of truth for the site's scheduled automations.
 *
 * Adding a new cron? Register it here so the /admin/automations hub
 * picks it up automatically — including its label, schedule, dashboard
 * deep-link, and a `getStatus()` callback that returns last-run info.
 *
 * Schedule strings come straight from vercel.json (Vercel cron uses UTC).
 * The hub formats them into human-readable strings + a Pacific-time hint
 * since most automations are tuned for Pacific business hours.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type AutomationStatus = {
  enabled: boolean | null            // null = no toggle (always-on)
  last_run_at: string | null
  last_run_outcome: 'ok' | 'skipped' | 'error' | 'partial' | null
  last_run_summary: string | null    // e.g. "5 posts created", "12 fields updated, 1 error"
  next_run_at: string | null         // estimated UTC ISO if computable
  // Polling crons (e.g. weekly-digest) tick way more often than they actually
  // do anything. `next_action_at` is the next time we expect a real
  // user-facing side effect (e.g. an email actually being sent), as opposed
  // to `next_run_at` which is just the next cron invocation.
  next_action_at?: string | null     // estimated UTC ISO of the next *action* (vs check)
  next_action_label?: string         // e.g. "Next email"
  notes?: string                     // optional inline annotation
}

export interface AutomationDefinition {
  id: string                         // stable slug used in the UI
  name: string
  description: string
  category: 'content' | 'discovery' | 'enrichment' | 'email'
  cron: string                       // UTC cron expression
  cron_pacific_hint?: string         // human-readable Pacific-time equivalent
  api_path: string                   // /api/cron/...
  dashboard_path?: string            // optional in-app deep link to a settings page
  settings_path?: string             // optional in-app deep link to settings
  // For polling crons, override "Next run" with a more accurate label
  // (e.g. "Next check") so admins don't think the timestamp means
  // "the next time something will happen".
  next_run_label?: string
  getStatus: (supabase: SupabaseClient) => Promise<AutomationStatus>
}

// ── Status helpers ───────────────────────────────────────────────────────────

async function enrichmentStatus(supabase: SupabaseClient): Promise<AutomationStatus> {
  // Settings
  const { data: settingsRow } = await supabase
    .from('site_settings').select('value').eq('key', 'enrichment_config').maybeSingle()
  const enabled = (settingsRow?.value as any)?.enabled !== false

  // Last 24h aggregate from enrichment_runs
  const { data: lastRun } = await supabase
    .from('enrichment_runs')
    .select('started_at').order('started_at', { ascending: false }).limit(1).maybeSingle()

  if (!lastRun) {
    return { enabled, last_run_at: null, last_run_outcome: null, last_run_summary: null, next_run_at: null }
  }

  // Aggregate the most-recent batch (rows started within ~5 min of the latest)
  const since = new Date(new Date(lastRun.started_at).getTime() - 5 * 60 * 1000).toISOString()
  const { data: batch } = await supabase
    .from('enrichment_runs').select('status, fields_updated')
    .gte('started_at', since)
  const updated = (batch ?? []).filter((r: any) => r.status === 'updated').length
  const errors = (batch ?? []).filter((r: any) => r.status === 'error').length
  const skipped = (batch ?? []).filter((r: any) => r.status === 'skipped').length
  const fields = (batch ?? []).reduce((s: number, r: any) => s + Number(r.fields_updated ?? 0), 0)

  const outcome: AutomationStatus['last_run_outcome'] =
    errors > 0 && updated === 0 ? 'error'
    : errors > 0 ? 'partial'
    : updated > 0 ? 'ok'
    : 'skipped'

  return {
    enabled,
    last_run_at: lastRun.started_at,
    last_run_outcome: outcome,
    last_run_summary: `${updated} updated, ${fields} fields filled, ${skipped} skipped, ${errors} errors`,
    next_run_at: null, // computed centrally from cron string
  }
}

async function weeklyDigestStatus(supabase: SupabaseClient): Promise<AutomationStatus> {
  const { data: settings } = await supabase
    .from('digest_settings')
    .select('enabled, day_of_week, send_hour, timezone')
    .eq('id', 1)
    .maybeSingle()
  const enabled = settings?.enabled !== false

  // digest_runs schema: week_monday (date PK), status (running|completed|failed),
  // started_at, finished_at, sent_count, trigger_type
  const { data: lastRun } = await supabase
    .from('digest_runs')
    .select('week_monday, status, started_at, finished_at, sent_count, trigger_type')
    .order('week_monday', { ascending: false }).limit(1).maybeSingle()

  // Compute the next *email* timestamp (as opposed to the next cron tick).
  // The cron polls hourly; the actual email goes out on the configured
  // day-of-week + hour in the configured timezone, and only once per ISO
  // week. We have to compute it in the target TZ and then bump by 7 days
  // if the candidate falls inside an already-sent week.
  let nextActionAt: string | null = null
  if (enabled && settings) {
    const tz = settings.timezone || 'America/Los_Angeles'
    const dow = settings.day_of_week ?? 1     // default Monday
    const hour = settings.send_hour ?? 10     // default 10am

    let candidate = nextOccurrenceInTz(dow, hour, tz)
    if (candidate) {
      // If we've already sent for the ISO week containing this candidate,
      // jump forward seven days to next week's send window.
      const lastSentWeek = lastRun?.status === 'completed'
        ? String(lastRun.week_monday).slice(0, 10)
        : null
      if (lastSentWeek) {
        let candidateMonday = isoMondayInTz(candidate, tz)
        if (lastSentWeek >= candidateMonday) {
          candidate = new Date(candidate.getTime() + 7 * 24 * 60 * 60 * 1000)
        }
      }
      nextActionAt = candidate.toISOString()
    }
  }

  if (!lastRun) {
    return {
      enabled,
      last_run_at: null,
      last_run_outcome: null,
      last_run_summary: 'Never sent',
      next_run_at: null,
      next_action_at: nextActionAt,
      next_action_label: 'Next email',
    }
  }

  const outcome: AutomationStatus['last_run_outcome'] =
    lastRun.status === 'completed' ? 'ok'
    : lastRun.status === 'failed' ? 'error'
    : lastRun.status === 'running' ? 'partial'
    : 'skipped'

  const summary = lastRun.status === 'completed'
    ? `Sent to ${lastRun.sent_count ?? '?'} recipients · week of ${String(lastRun.week_monday).slice(0, 10)}`
    : lastRun.status === 'failed'
      ? `Failed for week of ${String(lastRun.week_monday).slice(0, 10)} — see digest_runs row for detail`
      : lastRun.status === 'running'
        ? `Send in progress (started ${lastRun.started_at})`
        : `Status: ${lastRun.status}`

  // Most useful timestamp = finished_at if present, else started_at
  return {
    enabled,
    last_run_at: lastRun.finished_at ?? lastRun.started_at ?? null,
    last_run_outcome: outcome,
    last_run_summary: summary,
    next_run_at: null,
    next_action_at: nextActionAt,
    next_action_label: 'Next email',
  }
}

async function blogGenerateStatus(supabase: SupabaseClient): Promise<AutomationStatus> {
  const { data: rows } = await supabase
    .from('blog_generation_settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const r of rows ?? []) settings[r.key] = r.value
  const enabled = settings.enabled === 'true'

  // The cron INSERTs into `blog_posts` with ai_generated=true on success — that's the
  // ground-truth of "did the cron actually produce something". We also peek at the
  // queue for a recent failure so we can surface it as the "outcome".
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  const [latestPostRes, todayPostsRes, recentFailureRes] = await Promise.all([
    supabase.from('blog_posts')
      .select('created_at, title')
      .eq('ai_generated', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('blog_posts')
      .select('id', { count: 'exact', head: true })
      .eq('ai_generated', true)
      .gte('created_at', todayStart.toISOString()),
    supabase.from('blog_generation_queue')
      .select('completed_at, status, error')
      .eq('status', 'failed')
      .order('completed_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
  ])

  const latestPost = latestPostRes.data as { created_at: string; title: string } | null
  const todayCount = todayPostsRes.count ?? 0
  const recentFailure = recentFailureRes.data as { completed_at: string; status: string; error: string | null } | null

  // Use whichever happened more recently as "last run" — a recent failure beats
  // a successful post from yesterday because it's actionable.
  const failureIsNewer = recentFailure?.completed_at && latestPost?.created_at
    && new Date(recentFailure.completed_at).getTime() > new Date(latestPost.created_at).getTime()

  if (failureIsNewer || (recentFailure && !latestPost)) {
    return {
      enabled,
      last_run_at: recentFailure!.completed_at,
      last_run_outcome: 'error',
      last_run_summary: `Last attempt failed: ${(recentFailure!.error ?? '').slice(0, 100) || 'no error message'}`,
      next_run_at: null,
    }
  }

  if (latestPost) {
    return {
      enabled,
      last_run_at: latestPost.created_at,
      last_run_outcome: 'ok',
      last_run_summary: `${todayCount} post${todayCount === 1 ? '' : 's'} today · last: "${latestPost.title.slice(0, 60)}"`,
      next_run_at: null,
    }
  }

  return { enabled, last_run_at: null, last_run_outcome: null, last_run_summary: 'No posts generated yet', next_run_at: null }
}

async function discoveryPollStatus(supabase: SupabaseClient): Promise<AutomationStatus> {
  // No on/off toggle — always runs; per-source enabled flag controls participation.
  const { data: sources } = await supabase
    .from('discovery_sources')
    .select('id, last_polled_at, enabled')
  const enabled = (sources ?? []).some((s: any) => s.enabled)
  const lastPolled = (sources ?? [])
    .map((s: any) => s.last_polled_at)
    .filter(Boolean)
    .sort()
    .pop() ?? null

  const activeCount = (sources ?? []).filter((s: any) => s.enabled).length

  // Items found in the last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: items24h } = await supabase
    .from('discovery_items').select('id', { count: 'exact', head: true })
    .gte('created_at', since)

  return {
    enabled,
    last_run_at: lastPolled,
    last_run_outcome: lastPolled ? 'ok' : null,
    last_run_summary: `${activeCount} active sources · ${items24h ?? 0} items in last 24h`,
    next_run_at: null,
  }
}

async function discoveryExtractStatus(supabase: SupabaseClient): Promise<AutomationStatus> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // discovery_items status values used by the extract cron:
  //   'new'         → polled, awaiting extraction (pending pool)
  //   'extracting'  → in-flight (rare to see)
  //   'created'     → extracted AND auto-created a production draft (success!)
  //   'extracted'   → extracted but score < threshold, awaiting admin review
  //   'duplicate'   → matched an existing production
  //   'filtered_out'→ AI judged not a production announcement
  //   'error'       → extraction failed
  //
  // Successful processing stamps `processed_at` (NOT updated_at).
  const [created24h, extractedOnly24h, errors24h, dupes24h, filtered24h, pending, latest] = await Promise.all([
    supabase.from('discovery_items').select('id', { count: 'exact', head: true })
      .eq('status', 'created').gte('processed_at', since),
    supabase.from('discovery_items').select('id', { count: 'exact', head: true })
      .eq('status', 'extracted').gte('processed_at', since),
    supabase.from('discovery_items').select('id', { count: 'exact', head: true })
      .eq('status', 'error').gte('processed_at', since),
    supabase.from('discovery_items').select('id', { count: 'exact', head: true })
      .eq('status', 'duplicate').gte('processed_at', since),
    supabase.from('discovery_items').select('id', { count: 'exact', head: true })
      .eq('status', 'filtered_out').gte('processed_at', since),
    supabase.from('discovery_items').select('id', { count: 'exact', head: true })
      .eq('status', 'new'),
    supabase.from('discovery_items').select('processed_at, status')
      .in('status', ['created', 'extracted', 'duplicate', 'filtered_out', 'error'])
      .order('processed_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
  ])

  const errCount = errors24h.count ?? 0
  const totalProcessed = (created24h.count ?? 0) + (extractedOnly24h.count ?? 0)
    + errCount + (dupes24h.count ?? 0) + (filtered24h.count ?? 0)

  const outcome: AutomationStatus['last_run_outcome'] =
    !latest.data ? null
    : (latest.data as any).status === 'error' && totalProcessed === errCount ? 'error'
    : errCount > 0 ? 'partial'
    : totalProcessed > 0 ? 'ok'
    : 'skipped'

  const summary = totalProcessed === 0 && (pending.count ?? 0) === 0
    ? 'No items to process — feeds may be quiet'
    : `${created24h.count ?? 0} drafts created, ${extractedOnly24h.count ?? 0} below-threshold, `
      + `${dupes24h.count ?? 0} duplicates, ${filtered24h.count ?? 0} filtered out, `
      + `${errCount} errors (24h) · ${pending.count ?? 0} pending`

  return {
    enabled: true, // always on (per-source enable flag controls participation)
    last_run_at: (latest.data as any)?.processed_at ?? null,
    last_run_outcome: outcome,
    last_run_summary: summary,
    next_run_at: null,
  }
}

// ── The registry ─────────────────────────────────────────────────────────────

export const AUTOMATIONS: AutomationDefinition[] = [
  {
    id: 'enrich-profiles',
    name: 'Profile Enrichment',
    description: 'Nightly AI web-research that fills missing fields on the least-complete published company / crew profiles.',
    category: 'enrichment',
    cron: '0 16 * * *',
    cron_pacific_hint: 'Daily · 9am PDT / 8am PST',
    api_path: '/api/cron/enrich-profiles',
    dashboard_path: '/admin/enrichment',
    settings_path: '/admin/enrichment',
    getStatus: enrichmentStatus,
  },
  {
    id: 'weekly-digest',
    name: 'Weekly Email Digest',
    description: 'Sends the weekly production-list email to subscribers, gated on the list being published with enough productions.',
    category: 'email',
    cron: '0 * * * *',
    cron_pacific_hint: 'Hourly check · sends on configured day/time',
    api_path: '/api/cron/weekly-digest',
    settings_path: '/admin/email/digest-settings',
    next_run_label: 'Next check',
    getStatus: weeklyDigestStatus,
  },
  {
    id: 'blog-generate',
    name: 'AI Blog Generator',
    description: 'Auto-generates blog posts from queued topics, throttled by daily rate-limit and quality gates.',
    category: 'content',
    cron: '0 6,14,22 * * *',
    cron_pacific_hint: '3×/day (UTC 6/14/22)',
    api_path: '/api/cron/blog-generate',
    dashboard_path: '/admin/blog/generate',
    settings_path: '/admin/blog/generate',
    getStatus: blogGenerateStatus,
  },
  {
    id: 'discovery-poll',
    name: 'Discovery — Poll Sources',
    description: 'Polls registered RSS / web sources for new production trade-press articles to extract.',
    category: 'discovery',
    cron: '0 */6 * * *',
    cron_pacific_hint: 'Every 6 hours',
    api_path: '/api/cron/discovery-poll',
    dashboard_path: '/admin/discovery',
    getStatus: discoveryPollStatus,
  },
  {
    id: 'discovery-extract',
    name: 'Discovery — Extract Items',
    description: 'Drains the pending-items queue, running each through the AI extractor to create production drafts.',
    category: 'discovery',
    cron: '30 * * * *',
    cron_pacific_hint: 'Every hour at :30',
    api_path: '/api/cron/discovery-extract',
    dashboard_path: '/admin/discovery',
    getStatus: discoveryExtractStatus,
  },
]

// ── Timezone-aware "next occurrence" helpers ────────────────────────────────

const DOW_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

/**
 * Find the next moment after `from` whose (day-of-week, hour) match `targetDow`
 * + `targetHour` when interpreted in the IANA timezone `tz`. Returns a UTC
 * Date ready for ISO serialization.
 *
 * The Date object only knows UTC and machine-local time, so we can't just
 * `setHours(...)` and trust the result for an arbitrary IANA zone. Instead we
 * walk forward in 1-hour steps and ask Intl.DateTimeFormat to render each
 * candidate in the target zone — first hit wins. 8 days × 24 hours = 192
 * iterations max, so this is cheap.
 */
function nextOccurrenceInTz(
  targetDow: number,
  targetHour: number,
  tz: string,
  from: Date = new Date(),
): Date | null {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  })

  // Snap to the next top-of-hour so we don't return "now" for a window we're
  // already inside (e.g. it's 10:42 AM Mon and target is Mon 10:00 — that
  // window is already past).
  const cursor = new Date(from)
  cursor.setUTCMinutes(0, 0, 0)
  cursor.setUTCHours(cursor.getUTCHours() + 1)

  for (let i = 0; i < 24 * 8; i++) {
    const parts = fmt.formatToParts(cursor)
    const wkPart = parts.find(p => p.type === 'weekday')?.value ?? ''
    const hourPart = parts.find(p => p.type === 'hour')?.value ?? ''
    const dow = DOW_MAP[wkPart]
    const hour = parseInt(hourPart, 10)
    if (dow === targetDow && hour === targetHour) {
      return new Date(cursor.getTime())
    }
    cursor.setUTCHours(cursor.getUTCHours() + 1)
  }
  return null
}

/**
 * Given any UTC Date and an IANA timezone, return the YYYY-MM-DD of the
 * Monday of the ISO week that contains that instant *in the target zone*.
 * Used to compare against `digest_runs.week_monday`, which is a date string.
 */
function isoMondayInTz(date: Date, tz: string): string {
  const wkFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const dow = DOW_MAP[wkFmt.format(date)] ?? 1
  const ymdParts = dateFmt.formatToParts(date)
  const y = ymdParts.find(p => p.type === 'year')!.value
  const m = ymdParts.find(p => p.type === 'month')!.value
  const d = ymdParts.find(p => p.type === 'day')!.value
  const daysSinceMonday = dow === 0 ? 6 : dow - 1
  // Anchor to UTC for the date arithmetic — we only care about Y-M-D, not time.
  const dt = new Date(`${y}-${m}-${d}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() - daysSinceMonday)
  return dt.toISOString().slice(0, 10)
}

// ── Cron parsing helpers ─────────────────────────────────────────────────────

/**
 * Compute the next firing of a cron expression after `from`. Supports the
 * subset Vercel uses: minute hour dayOfMonth month dayOfWeek with `*`,
 * `n`, `n,m,…`, and `*\/n`. No DOM/DOW combination, no L/W/#, etc.
 *
 * Returns null if we can't compute it (defensive fallback).
 */
export function nextCronTime(expr: string, from: Date = new Date()): Date | null {
  try {
    const parts = expr.trim().split(/\s+/)
    if (parts.length !== 5) return null
    const [m, h, dom, mon, dow] = parts.map(parseField)
    if (!m || !h || !dom || !mon || !dow) return null

    // Search forward up to 1 year
    const start = new Date(Date.UTC(
      from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(),
      from.getUTCHours(), from.getUTCMinutes() + 1, 0, 0,
    ))
    const limit = new Date(start)
    limit.setUTCFullYear(limit.getUTCFullYear() + 1)

    const cur = new Date(start)
    while (cur < limit) {
      if (
        m.has(cur.getUTCMinutes()) &&
        h.has(cur.getUTCHours()) &&
        dom.has(cur.getUTCDate()) &&
        mon.has(cur.getUTCMonth() + 1) &&
        dow.has(cur.getUTCDay())
      ) {
        return cur
      }
      cur.setUTCMinutes(cur.getUTCMinutes() + 1)
    }
    return null
  } catch {
    return null
  }
}

function parseField(field: string): Set<number> | null {
  const s = new Set<number>()
  for (const part of field.split(',')) {
    if (part === '*') return new Set(Array.from({ length: 60 }, (_, i) => i)) // permissive — caller checks per-unit
    const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/)
    if (stepMatch) {
      const range = stepMatch[1]
      const step = Number(stepMatch[2])
      const [lo, hi] = range === '*' ? [0, 59] : (() => {
        const r = range.split('-').map(Number); return r.length === 1 ? [r[0], 59] : [r[0], r[1]]
      })()
      for (let i = lo; i <= hi; i += step) s.add(i)
      continue
    }
    const rangeMatch = part.match(/^(\d+)-(\d+)$/)
    if (rangeMatch) {
      for (let i = Number(rangeMatch[1]); i <= Number(rangeMatch[2]); i++) s.add(i)
      continue
    }
    if (/^\d+$/.test(part)) { s.add(Number(part)); continue }
    return null
  }
  return s
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) {
    const future = -ms
    if (future < 60_000) return 'in <1 min'
    if (future < 3_600_000) return `in ${Math.round(future / 60_000)} min`
    if (future < 86_400_000) return `in ${Math.round(future / 3_600_000)} hr`
    return `in ${Math.round(future / 86_400_000)}d`
  }
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} hr ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}
