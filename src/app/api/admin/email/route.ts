import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/send-email'
import { getTemplate, emailTemplates } from '@/lib/email-templates'
import { reconcileStaleDigestRuns } from '@/lib/digest-reconcile'

/**
 * GET /api/admin/email?action=logs|templates|audience-counts
 */
export async function GET(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const action = req.nextUrl.searchParams.get('action') ?? 'logs'

  if (action === 'template-overrides') {
    try {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('email_template_overrides')
        .select('*')
      if (error) {
        // Table may not exist yet
        return NextResponse.json({ overrides: [] })
      }
      return NextResponse.json({ overrides: data ?? [] })
    } catch {
      return NextResponse.json({ overrides: [] })
    }
  }

  if (action === 'templates') {
    // Return template metadata (without render functions)
    const templates = emailTemplates.map(({ slug, name, description, category, variables }) => ({
      slug, name, description, category, variables,
    }))
    return NextResponse.json({ templates })
  }

  if (action === 'audience-counts') {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return NextResponse.json({ audiences: [] })

    const audienceConfigs = [
      { id: process.env.RESEND_AUDIENCE_ID, label: 'Newsletter Subscribers' },
      { id: process.env.RESEND_AUDIENCE_MEMBERS_ID, label: 'Active Members' },
      { id: process.env.RESEND_AUDIENCE_PAST_MEMBERS_ID, label: 'Past Members' },
    ].filter(a => a.id)

    const audiences = await Promise.all(
      audienceConfigs.map(async (aud) => {
        try {
          // Paginate through all contacts to get accurate total count
          let totalCount = 0
          let afterCursor: string | undefined
          let hasMore = true

          while (hasMore) {
            const url = new URL(`https://api.resend.com/audiences/${aud.id}/contacts`)
            url.searchParams.set('limit', '100')
            if (afterCursor) url.searchParams.set('after', afterCursor)

            const res = await fetch(url.toString(), {
              headers: { Authorization: `Bearer ${apiKey}` },
            })
            if (!res.ok) break

            const data = await res.json()
            const contacts = data.data ?? []
            totalCount += contacts.length

            hasMore = data.has_more === true
            if (hasMore && contacts.length > 0) {
              afterCursor = contacts[contacts.length - 1].id
            } else {
              hasMore = false
            }
          }

          return {
            id: aud.id,
            label: aud.label,
            contactCount: totalCount,
          }
        } catch { /* skip */ }
        return { id: aud.id, label: aud.label, contactCount: 0 }
      })
    )

    return NextResponse.json({ audiences })
  }

  if (action === 'digest-settings') {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('digest_settings')
      .select('*')
      .eq('id', 1)
      .single()

    return NextResponse.json({ settings: data ?? null })
  }

  if (action === 'digest-history') {
    const supabase = createAdminClient()

    // First try to find bulk summary rows (new format)
    const { data: bulkLogs } = await supabase
      .from('email_logs')
      .select('id, recipient, subject, status, resend_id, error_message, sent_at')
      .eq('template_slug', 'weekly-digest')
      .like('recipient', 'bulk:%')
      .order('sent_at', { ascending: false })
      .limit(50)

    // Also aggregate individual digest sends by date (for sends before bulk logging)
    // Group by sent_at date to reconstruct past digest sends
    const { data: individualLogs } = await supabase
      .from('email_logs')
      .select('id, recipient, subject, status, sent_at')
      .eq('template_slug', 'weekly-digest')
      .not('recipient', 'like', 'bulk:%')
      .order('sent_at', { ascending: false })
      .limit(2000)

    // Group individual sends by date (within a 2-hour window = same digest batch)
    const batchMap = new Map<string, { count: number; firstId: string; subject: string; sent_at: string; succeeded: number; failed: number }>()
    for (const log of (individualLogs ?? [])) {
      const dateHour = log.sent_at ? log.sent_at.slice(0, 13) : 'unknown' // group by YYYY-MM-DDTHH
      // Round to nearest 2-hour window
      const d = new Date(log.sent_at)
      const windowKey = `${log.sent_at.slice(0, 10)}-${Math.floor(d.getHours() / 2)}`

      if (!batchMap.has(windowKey)) {
        batchMap.set(windowKey, {
          count: 0,
          firstId: log.id,
          subject: log.subject || '',
          sent_at: log.sent_at,
          succeeded: 0,
          failed: 0,
        })
      }
      const batch = batchMap.get(windowKey)!
      batch.count++
      if (log.status === 'sent' || log.status === 'delivered') {
        batch.succeeded++
      } else {
        batch.failed++
      }
    }

    // Convert batches to the same format as bulk logs
    // Parse subject line for week/production metadata:
    //   "Weekly Digest: 40 Productions This Week — Mar 23, 2026"
    const syntheticLogs = Array.from(batchMap.values()).map((batch) => {
      let productionCount: number | undefined
      let weekMonday: string | undefined
      const countMatch = batch.subject.match(/Weekly Digest:\s*(\d+)\s*Productions/)
      if (countMatch) productionCount = parseInt(countMatch[1], 10)
      const dateMatch = batch.subject.match(/—\s*(.+)$/)
      if (dateMatch) {
        const parsed = new Date(dateMatch[1].trim())
        if (!isNaN(parsed.getTime())) {
          weekMonday = parsed.toISOString().slice(0, 10)
        }
      }

      return {
        id: batch.firstId,
        recipient: `bulk:${batch.count}`,
        subject: batch.subject,
        status: 'sent',
        resend_id: JSON.stringify({
          trigger: 'manual',
          sent: batch.succeeded,
          failed: batch.failed,
          ...(productionCount !== undefined ? { productionCount } : {}),
          ...(weekMonday ? { weekMonday } : {}),
        }),
        error_message: batch.failed > 0 ? `${batch.failed} failed` : null,
        sent_at: batch.sent_at,
      }
    })

    // Merge: deduplicate by 2-hour time window so bulk logs and synthetic logs
    // from the same batch don't both appear, but different sends on the same day are kept
    const bulkWindows = new Set((bulkLogs ?? []).map((l) => {
      const d = new Date(l.sent_at)
      return `${l.sent_at?.slice(0, 10)}-${Math.floor(d.getHours() / 2)}`
    }))
    const filteredSynthetic = syntheticLogs.filter((s) => {
      const d = new Date(s.sent_at)
      const window = `${s.sent_at?.slice(0, 10)}-${Math.floor(d.getHours() / 2)}`
      return !bulkWindows.has(window)
    })

    const allLogs = [...(bulkLogs ?? []), ...filteredSynthetic]
      .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
      .slice(0, 50)

    return NextResponse.json({ logs: allLogs })
  }

  if (action === 'digest-stats') {
    const supabase = createAdminClient()

    // Self-heal: any digest_runs row stuck in 'running' for >15 min gets
    // reconciled against email_logs and updated to its true final status.
    // This means the dashboard always shows current truth, no admin action
    // required when the cron worker dies before its cleanup block.
    try {
      await reconcileStaleDigestRuns(supabase, { staleAfterMinutes: 15 })
    } catch (e) {
      console.error('[digest-stats] reconcile failed (continuing):', e)
    }

    // Source of truth = digest_runs. One row per ISO week (week_monday is the
    // PK), updated at the end of each run with sent/failed/recipient counts.
    // Older "bulk:N" entries in email_logs are merged in for any historical
    // weeks that predate digest_runs (so the table doesn't suddenly look
    // empty for older history).
    const { data: runRows } = await supabase
      .from('digest_runs')
      .select('week_monday, status, started_at, finished_at, sent_count, failed_count, recipients_count, trigger_type, error_message')
      .order('week_monday', { ascending: false })
      .limit(52) // ~1 year of weeks

    type Send = {
      week: string                                // "Week of Apr 20, 2026"
      week_monday: string                         // "2026-04-20" — for dedup
      total: number
      sent: number
      failed: number
      date: string                                // human-formatted send date
      sent_at_iso: string | null                  // for sorting / KPI
      status: 'completed' | 'failed' | 'running' | 'unknown'
      trigger_type: string | null
      error: string | null
    }

    const formatWeekLabel = (isoDate: string) => {
      // isoDate is a YYYY-MM-DD or full ISO; render in UTC to avoid TZ drift
      // on the date portion.
      const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`)
      return d.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
      })
    }
    const formatSendDate = (iso: string | null) => {
      if (!iso) return '—'
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    }

    const byWeek = new Map<string, Send>()

    for (const row of runRows ?? []) {
      const r = row as any
      const week_monday = String(r.week_monday).slice(0, 10)
      const weekLabel = formatWeekLabel(week_monday)
      const sendIso = r.finished_at ?? r.started_at ?? null
      const status = (r.status as Send['status']) ?? 'unknown'

      byWeek.set(week_monday, {
        week: `Week of ${weekLabel}`,
        week_monday,
        // recipients_count is the total addressed; fall back to sent+failed
        // so a row mid-update still shows something sensible.
        total: r.recipients_count ?? ((r.sent_count ?? 0) + (r.failed_count ?? 0)),
        sent: r.sent_count ?? 0,
        failed: r.failed_count ?? 0,
        date: formatSendDate(sendIso),
        sent_at_iso: sendIso,
        status,
        trigger_type: r.trigger_type ?? null,
        error: r.error_message ?? null,
      })
    }

    // Backfill from email_logs `bulk:N` rows for any week not already covered
    // by digest_runs (legacy data — digest_runs was added later). We dedupe
    // by ISO-week (Monday in UTC) of the sent_at timestamp.
    const isoWeekMondayUTC = (d: Date) => {
      const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
      const day = x.getUTCDay() // 0=Sun
      const diff = day === 0 ? -6 : 1 - day
      x.setUTCDate(x.getUTCDate() + diff)
      return x.toISOString().slice(0, 10)
    }

    let dPage = 0
    while (dPage < 5) { // hard cap so a malformed table can't OOM us
      const { data } = await supabase
        .from('email_logs')
        .select('recipient, status, sent_at, error_message')
        .eq('template_slug', 'weekly-digest')
        .like('recipient', 'bulk:%')
        .order('sent_at', { ascending: false })
        .range(dPage * 500, dPage * 500 + 499)
      if (!data || data.length === 0) break

      for (const log of data) {
        const wk = isoWeekMondayUTC(new Date(log.sent_at))
        if (byWeek.has(wk)) continue // digest_runs wins

        const totalRecipients = parseInt(String(log.recipient).replace('bulk:', ''), 10) || 0
        const failedCount = log.error_message ? log.error_message.split(';').length : 0
        const sentCount = Math.max(0, totalRecipients - failedCount)
        byWeek.set(wk, {
          week: `Week of ${formatWeekLabel(wk)}`,
          week_monday: wk,
          total: totalRecipients,
          sent: sentCount,
          failed: failedCount,
          date: formatSendDate(log.sent_at),
          sent_at_iso: log.sent_at,
          status: failedCount === 0 ? 'completed' : 'completed',
          trigger_type: 'legacy',
          error: log.error_message ?? null,
        })
      }
      if (data.length < 500) break
      dPage++
    }

    const sends = Array.from(byWeek.values())
      .sort((a, b) => b.week_monday.localeCompare(a.week_monday))

    // KPIs come from ALL-TIME aggregates, not just the visible 52-week
    // window, so "Total Digests Sent" keeps growing past year 1 and
    // "Last Sent" reflects truth across history. We compute by paging
    // through all completed digest_runs once (one row per week → cheap
    // even after years of operation) and merging in any legacy bulk:N
    // entries from weeks not yet in digest_runs.
    let totalSent = 0
    let totalFailed = 0
    let totalRecipientsAllWeeks = 0
    let completedWeeks = 0
    let lastSentAt: string | null = null

    {
      let page = 0
      while (page < 20) { // safety cap (10k weeks = 192 yrs)
        const { data } = await supabase
          .from('digest_runs')
          .select('finished_at, sent_count, failed_count, recipients_count, status')
          .eq('status', 'completed')
          .order('finished_at', { ascending: false, nullsFirst: false })
          .range(page * 500, page * 500 + 499)
        if (!data || data.length === 0) break
        for (const r of data as any[]) {
          totalSent += r.sent_count ?? 0
          totalFailed += r.failed_count ?? 0
          totalRecipientsAllWeeks += r.recipients_count ?? 0
          completedWeeks++
          if (!lastSentAt && r.finished_at) lastSentAt = r.finished_at
        }
        if (data.length < 500) break
        page++
      }
    }

    // Backfill legacy weeks (only present in email_logs bulk:N) into the
    // KPIs too, deduped by ISO week so we never double-count a week that
    // already has a digest_runs row.
    const weeksAlreadyCounted = new Set<string>(
      sends.filter(s => s.status === 'completed').map(s => s.week_monday),
    )
    for (const s of sends) {
      if (s.status === 'completed' && s.trigger_type === 'legacy' && !weeksAlreadyCounted.has(s.week_monday)) {
        totalSent += s.sent
        totalFailed += s.failed
        totalRecipientsAllWeeks += s.total
        completedWeeks++
        weeksAlreadyCounted.add(s.week_monday)
        if (!lastSentAt && s.sent_at_iso) lastSentAt = s.sent_at_iso
      }
    }

    const avgPerWeek = completedWeeks > 0 ? totalRecipientsAllWeeks / completedWeeks : 0

    // Pull current digest schedule so the "Automated Cron Schedule" banner and
    // anything else in the UI can render the real configured day/hour/tz
    // instead of a hardcoded "Monday 10am ET" string.
    const { data: schedule } = await supabase
      .from('digest_settings')
      .select('enabled, day_of_week, send_hour, timezone, min_productions')
      .eq('id', 1)
      .single()

    return NextResponse.json({
      sends,
      totalSent,
      totalFailed,
      avgPerWeek,
      lastSentAt,
      completedWeeks,
      cronEnabled: !!schedule?.enabled,
      schedule: schedule
        ? {
            enabled: !!schedule.enabled,
            day_of_week: schedule.day_of_week,
            send_hour: schedule.send_hour,
            timezone: schedule.timezone,
            min_productions: schedule.min_productions,
          }
        : null,
    })
  }

  // Default: logs
  const supabase = createAdminClient()
  const statusFilter = req.nextUrl.searchParams.get('status')
  const templateFilter = req.nextUrl.searchParams.get('template')
  const searchFilter = req.nextUrl.searchParams.get('search')
  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10)
  const pageSize = 50

  let query = supabase
    .from('email_logs')
    .select('*', { count: 'exact' })
    .order('sent_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }
  if (templateFilter) {
    query = query.eq('template_slug', templateFilter)
  }
  if (searchFilter) {
    query = query.or(`recipient.ilike.%${searchFilter}%,subject.ilike.%${searchFilter}%`)
  }

  const { data: logs, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ logs: logs ?? [], total: count ?? 0, page, pageSize })
}

/**
 * POST /api/admin/email  — Send a test email
 * Body: { action: 'send-test', templateSlug: string, to: string }
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  if (body.action === 'reconcile-digest-runs') {
    // Manual self-heal — admin clicks "Reconcile stuck runs" in the
    // Digest Reports tab. Uses a 0-minute threshold so the admin can
    // recover something that JUST got stuck, not just rows older than
    // 15 min like the auto-sweep on cron fire and stats load.
    const supabase = createAdminClient()
    try {
      const minutes = typeof body.staleAfterMinutes === 'number' ? body.staleAfterMinutes : 5
      const summary = await reconcileStaleDigestRuns(supabase, { staleAfterMinutes: minutes })
      return NextResponse.json({ ok: true, ...summary })
    } catch (e: any) {
      return NextResponse.json({ error: e.message ?? 'Reconcile failed' }, { status: 500 })
    }
  }

  if (body.action === 'send-test') {
    const { templateSlug, to } = body
    if (!templateSlug || !to) {
      return NextResponse.json({ error: 'templateSlug and to are required' }, { status: 400 })
    }

    // For weekly-digest, use real production data from the current week
    if (templateSlug === 'weekly-digest') {
      const baseUrl = req.nextUrl.origin || 'https://productionlist.com'
      try {
        const digestRes = await fetch(`${baseUrl}/api/admin/send-weekly-digest?test=${encodeURIComponent(to)}`, {
          method: 'POST',
          headers: {
            cookie: req.headers.get('cookie') || '',
          },
        })
        const digestData = await digestRes.json()
        return NextResponse.json({
          success: digestRes.ok && digestData.success,
          error: digestData.error || digestData.message,
          emailId: digestData.emailId,
        })
      } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message ?? 'Failed to send digest test' })
      }
    }

    const template = getTemplate(templateSlug)
    if (!template) {
      return NextResponse.json({ error: `Unknown template: ${templateSlug}` }, { status: 400 })
    }

    // Build sample variables for test
    const sampleVars: Record<string, string> = {}
    for (const v of template.variables) {
      switch (v) {
        case 'firstName': sampleVars[v] = 'Test User'; break
        case 'role': sampleVars[v] = 'Producer'; break
        case 'country': sampleVars[v] = 'United States'; break
        case 'resetLink': sampleVars[v] = 'https://productionlist.com/reset-password?token=test-token-123'; break
        case 'planName': sampleVars[v] = 'Annual Professional'; break
        case 'expiresAt': sampleVars[v] = '2026-12-31'; break
        case 'weekDate': sampleVars[v] = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); break
        case 'weekEndDate': {
          const d = new Date(); d.setDate(d.getDate() + 6);
          sampleVars[v] = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); break
        }
        case 'productionCount': sampleVars[v] = '42'; break
        case 'digestUrl': sampleVars[v] = 'https://productionlist.com/production-list'; break
        case 'productionsHtml': sampleVars[v] = ''; break
        case 'subject': sampleVars[v] = 'General Inquiry'; break
        default: sampleVars[v] = `[${v}]`
      }
    }

    const { subject, html } = template.render(sampleVars)

    const result = await sendEmail({
      to,
      subject: `[TEST] ${subject}`,
      html,
      templateSlug: `test:${templateSlug}`,
    })

    return NextResponse.json(result)
  }

  if (body.action === 'save-digest-settings') {
    const { enabled, day_of_week, send_hour, send_minute, timezone, min_productions, send_to_audience } = body
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('digest_settings')
      .upsert({
        id: 1,
        enabled: enabled ?? true,
        day_of_week: day_of_week ?? 1,
        send_hour: send_hour ?? 10,
        send_minute: send_minute ?? 0,
        timezone: timezone ?? 'America/Los_Angeles',
        min_productions: min_productions ?? 40,
        send_to_audience: send_to_audience ?? 'active_members',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  if (body.action === 'save-template') {
    const { slug, subject, html, isActive } = body
    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 })
    }

    try {
      const supabase = createAdminClient()
      const { error } = await supabase
        .from('email_template_overrides')
        .upsert({
          slug,
          subject_override: subject || null,
          html_override: html || null,
          is_active: isActive ?? true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'slug' })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    } catch (err: any) {
      return NextResponse.json({ error: err?.message ?? 'Failed to save template' }, { status: 500 })
    }
  }

  if (body.action === 'toggle-template') {
    const { slug, isActive } = body
    if (!slug || typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'slug and isActive (boolean) are required' }, { status: 400 })
    }

    try {
      const supabase = createAdminClient()
      // Upsert so it works even if no override row exists yet
      const { error } = await supabase
        .from('email_template_overrides')
        .upsert({
          slug,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'slug' })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    } catch (err: any) {
      return NextResponse.json({ error: err?.message ?? 'Failed to toggle template' }, { status: 500 })
    }
  }

  if (body.action === 'reset-template') {
    const { slug } = body
    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 })
    }

    try {
      const supabase = createAdminClient()
      const { error } = await supabase
        .from('email_template_overrides')
        .delete()
        .eq('slug', slug)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    } catch (err: any) {
      return NextResponse.json({ error: err?.message ?? 'Failed to reset template' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
