/**
 * Reconcile orphaned `digest_runs` rows that got stuck in the `running`
 * state because the worker (Vercel cron, manual trigger, etc.) was killed
 * before its `finally{}` cleanup block ran.
 *
 * We can recover the truth because every successful per-recipient send is
 * also written to `email_logs` (template_slug='weekly-digest', recipient is
 * the email address) plus a single `bulk:N` summary row. Counting those
 * gives us authoritative sent/failed numbers for the week.
 *
 * Called from:
 *   • The top of every weekly-digest cron fire (auto-self-heal — fixes any
 *     orphan from the previous run before this one starts).
 *   • A manual admin trigger from the Digest Reports tab.
 *
 * "Stale" = status='running' AND started_at older than `staleAfterMinutes`
 * (default 15). The longest in-pipeline send observed is ~3-4 min, so 15
 * is a comfortable cutoff — anything older is unambiguously orphaned.
 */

import type { createAdminClient } from '@/lib/supabase/server'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

export interface ReconcileSummary {
  scanned: number
  reconciled: number
  rows: Array<{
    week_monday: string
    started_at: string
    final_status: 'completed' | 'failed'
    sent: number
    failed: number
    recipients: number
    note: string
  }>
}

export async function reconcileStaleDigestRuns(
  supabase: SupabaseAdmin,
  options: { staleAfterMinutes?: number } = {},
): Promise<ReconcileSummary> {
  const staleAfterMinutes = options.staleAfterMinutes ?? 15
  const cutoff = new Date(Date.now() - staleAfterMinutes * 60 * 1000).toISOString()

  // 1. Find stale 'running' rows.
  const { data: stuck } = await supabase
    .from('digest_runs')
    .select('week_monday, started_at')
    .eq('status', 'running')
    .lt('started_at', cutoff)
    .order('week_monday', { ascending: true })

  const stuckRows = (stuck ?? []) as Array<{ week_monday: string; started_at: string }>
  const summary: ReconcileSummary = {
    scanned: stuckRows.length,
    reconciled: 0,
    rows: [],
  }

  if (stuckRows.length === 0) return summary

  for (const row of stuckRows) {
    const wm = String(row.week_monday).slice(0, 10)
    // Look one day before week_monday to one week after — wide enough for
    // any send that spanned the boundary (e.g. cron started late Sunday
    // for the Mon-Sun ISO week).
    const windowStart = new Date(`${wm}T00:00:00Z`)
    windowStart.setUTCDate(windowStart.getUTCDate() - 1)
    const windowEnd = new Date(`${wm}T00:00:00Z`)
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 8)

    // 2. Count actual sends/fails for this week from email_logs (excluding
    //    the bulk:N summary row).
    const [sentRes, failedRes, bulkRes] = await Promise.all([
      supabase.from('email_logs')
        .select('id', { count: 'exact', head: true })
        .eq('template_slug', 'weekly-digest')
        .eq('status', 'sent')
        .not('recipient', 'like', 'bulk:%')
        .gte('sent_at', windowStart.toISOString())
        .lt('sent_at', windowEnd.toISOString()),
      supabase.from('email_logs')
        .select('id', { count: 'exact', head: true })
        .eq('template_slug', 'weekly-digest')
        .eq('status', 'failed')
        .not('recipient', 'like', 'bulk:%')
        .gte('sent_at', windowStart.toISOString())
        .lt('sent_at', windowEnd.toISOString()),
      // Latest per-recipient log timestamp = best estimate of "when the
      // send actually finished" since the bulk:N row may have never been
      // written if the function died first.
      supabase.from('email_logs')
        .select('sent_at, recipient, error_message')
        .eq('template_slug', 'weekly-digest')
        .gte('sent_at', windowStart.toISOString())
        .lt('sent_at', windowEnd.toISOString())
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const sentCount = sentRes.count ?? 0
    const failedCount = failedRes.count ?? 0
    const totalRecipients = sentCount + failedCount
    const finishedAt = (bulkRes.data as any)?.sent_at ?? new Date().toISOString()

    // 3. Decide final status.
    //
    //   • Any successful sends → completed (Resend delivered them; the
    //     run did its job, the cleanup just didn't fire).
    //   • Zero sent + some failures → failed.
    //   • Zero of either (no email_logs at all) → failed with a clear note;
    //     the worker died before it got to the send loop. The atomic week
    //     lock is now released so a manual retry is possible.
    let finalStatus: 'completed' | 'failed'
    let note: string
    if (sentCount > 0) {
      finalStatus = 'completed'
      note = `Recovered from email_logs: ${sentCount} sent, ${failedCount} failed`
    } else if (failedCount > 0) {
      finalStatus = 'failed'
      note = `All ${failedCount} attempts failed — see email_logs for week ${wm}`
    } else {
      finalStatus = 'failed'
      note = `Worker died before sending any emails. Delete this digest_runs row in Supabase to allow a manual retry.`
    }

    const { error: updErr } = await supabase
      .from('digest_runs')
      .update({
        status: finalStatus,
        finished_at: finishedAt,
        sent_count: sentCount,
        failed_count: failedCount,
        recipients_count: totalRecipients,
        error_message: `[reconciled] ${note}`,
      })
      .eq('week_monday', wm)
      .eq('status', 'running') // optimistic lock — don't clobber if it self-healed in the meantime

    if (updErr) {
      summary.rows.push({
        week_monday: wm, started_at: row.started_at,
        final_status: finalStatus, sent: sentCount, failed: failedCount,
        recipients: totalRecipients,
        note: `UPDATE failed: ${updErr.message}`,
      })
      continue
    }

    summary.reconciled++
    summary.rows.push({
      week_monday: wm, started_at: row.started_at,
      final_status: finalStatus, sent: sentCount, failed: failedCount,
      recipients: totalRecipients,
      note,
    })
  }

  return summary
}
