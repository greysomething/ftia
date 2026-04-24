/**
 * Weekly Digest Pipeline — shared between the cron route and the admin
 * "Send Now" route. Extracted so the cron can run the full send inline
 * instead of making a cross-function HTTP fetch (which was hitting the
 * serverless function timeout and causing silent failures).
 *
 * Route handlers keep their route-specific concerns (auth, streaming,
 * preview, test email). The actual "fetch productions, fetch recipients,
 * dedupe, batch via Resend, log" pipeline lives here.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { getTemplate } from '@/lib/email-templates'

export const MIN_PRODUCTIONS = 40

export interface ProductionForDigest {
  id: number
  title: string
  slug: string
  production_type_links: Array<{
    is_primary: boolean
    production_types: { name: string; slug: string } | null
  }>
  production_status_links: Array<{
    is_primary: boolean
    production_statuses: { name: string; slug: string } | null
  }>
  production_locations: Array<{
    location: string | null
    city: string | null
    stage: string | null
    country: string | null
    sort_order: number | null
  }>
}

export function getCurrentWeekMonday(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  return monday.toISOString().split('T')[0]
}

export function formatWeekDate(mondayStr: string): string {
  const monday = new Date(mondayStr + 'T00:00:00')
  return monday.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatWeekEndDate(mondayStr: string): string {
  const monday = new Date(mondayStr + 'T00:00:00')
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return sunday.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function getProductionType(prod: ProductionForDigest): string {
  const primary = prod.production_type_links?.find((l) => l.is_primary)
  if (primary?.production_types?.name) return primary.production_types.name
  const first = prod.production_type_links?.[0]
  if (first?.production_types?.name) return first.production_types.name
  return ''
}

export function getLocationString(prod: ProductionForDigest): string {
  const locs = prod.production_locations || []
  if (locs.length === 0) return ''

  const sorted = [...locs].sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))

  const parts: string[] = []
  for (const loc of sorted) {
    if (loc.city && loc.stage) {
      parts.push(`${loc.city}, ${loc.stage}`)
    } else if (loc.city && loc.country) {
      parts.push(`${loc.city}, ${loc.country}`)
    } else if (loc.city) {
      parts.push(loc.city)
    } else if (loc.location) {
      parts.push(loc.location)
    }
  }

  return parts.join(' / ')
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildProductionsHtml(productions: ProductionForDigest[]): string {
  if (!productions.length) return ''

  const rows = productions.map((prod, i) => {
    const type = getProductionType(prod)
    const location = getLocationString(prod)
    const bgColor = i % 2 === 0 ? '#ffffff' : '#f9fafb'

    const metaParts: string[] = []
    if (type) metaParts.push(escapeHtml(type))
    if (location) metaParts.push(escapeHtml(location))
    const metaLine = metaParts.length > 0
      ? `<div style="color:#777;font-size:12px;margin-top:2px;">${metaParts.join(' &nbsp;&bull;&nbsp; ')}</div>`
      : ''

    return `<tr style="background-color:${bgColor};">
      <td style="padding:10px 12px;border-bottom:1px solid #eee;">
        <a href="https://productionlist.com/productions/${prod.slug}" style="color:#2b7bb9;text-decoration:none;font-weight:600;font-size:15px;line-height:1.3;">${escapeHtml(prod.title)}</a>
        ${metaLine}
      </td>
    </tr>`
  })

  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px;">
    ${rows.join('\n')}
  </table>`
}

export interface PipelineOptions {
  triggerType: 'auto' | 'manual'
  isDryRun?: boolean
  emit?: (event: Record<string, any>) => void
}

export interface PipelineResult {
  success?: boolean
  error?: string
  dryRun?: boolean
  message?: string
  stats?: {
    totalRecipients: number
    sent: number
    failed: number
    productionCount: number
    weekMonday: string
    audienceFetched: number
    alreadySentCount?: number
    alreadySent?: number
    audienceUsed: string
  }
  errors?: string[]
}

/**
 * Run the full weekly digest send pipeline inline.
 * Returns a result object. Optionally accepts an `emit` callback for
 * streaming progress events to the admin UI.
 */
export async function runWeeklyDigestPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const { triggerType, isDryRun = false } = opts
  const emit = opts.emit ?? (() => {})

  const supabase = createAdminClient()

  // 1. Current week Monday
  const weekMonday = getCurrentWeekMonday()
  const weekDate = formatWeekDate(weekMonday)
  const weekEndDate = formatWeekEndDate(weekMonday)

  // 2. Fetch productions for this week
  const { data: weekEntries } = await supabase
    .from('production_week_entries')
    .select('production_id')
    .eq('week_monday', weekMonday)

  if (!weekEntries || weekEntries.length === 0) {
    return { error: 'No productions found for the current week.' }
  }

  const productionIds = weekEntries.map((e: any) => e.production_id)

  // 3. Minimum production threshold
  if (productionIds.length < MIN_PRODUCTIONS) {
    return {
      error: `Current week has ${productionIds.length} productions. Minimum ${MIN_PRODUCTIONS} required before sending digest.`,
    }
  }

  // 3.25. HARD ALREADY-SENT PRE-CHECK — defense in depth.
  //
  // The atomic digest_runs lock (below) catches concurrent runs, but
  // it only knows about runs that went through this pipeline. Historical
  // sends (from before digest_runs existed, or after a manual row delete)
  // only leave a `bulk:N` row in email_logs. Check for one matching this
  // week's ISO-week window and bail if found.
  //
  // Window is exactly [weekMonday 00:00 UTC, weekMonday+7d 00:00 UTC) so
  // a late-Sunday send from week N doesn't create a false positive when
  // checking for week N+1's send.
  if (!isDryRun) {
    const windowStart = new Date(weekMonday + 'T00:00:00Z')
    const windowEnd = new Date(weekMonday + 'T00:00:00Z')
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 7)

    const { data: existingBulk } = await supabase
      .from('email_logs')
      .select('recipient, sent_at, resend_id')
      .eq('template_slug', 'weekly-digest')
      .like('recipient', 'bulk:%')
      .gte('sent_at', windowStart.toISOString())
      .lt('sent_at', windowEnd.toISOString())
      .limit(1)

    if (existingBulk && existingBulk.length > 0) {
      const row = existingBulk[0] as any
      return {
        error: `Weekly digest for week ${weekMonday} was already sent (${row.recipient} at ${row.sent_at}). Refusing to re-send.`,
      }
    }
  }

  // 3.5. ATOMIC RUN LOCK — prevent overlapping runs via digest_runs PK.
  //
  // Insert a row keyed on week_monday. If another run (from this cron
  // or anywhere else) has already inserted a row for this week, the
  // INSERT fails with a unique-violation and we bail early. This is
  // the database's atomic guarantee — there is no race window.
  //
  // Dry runs skip the lock since they don't actually send anything.
  if (!isDryRun) {
    const { error: acquireLockError } = await supabase
      .from('digest_runs')
      .insert({
        week_monday: weekMonday,
        status: 'running',
        trigger_type: triggerType,
      })

    if (acquireLockError) {
      const { data: existing } = await supabase
        .from('digest_runs')
        .select('status, started_at, finished_at, sent_count')
        .eq('week_monday', weekMonday)
        .maybeSingle()

      const ex = existing as any
      let msg = `Digest run lock for week ${weekMonday} could not be acquired: ${acquireLockError.message}`
      if (ex?.status === 'completed') {
        msg = `Digest for week ${weekMonday} was already sent (completed ${ex.finished_at}, ${ex.sent_count ?? '?'} recipients). Refusing to re-send.`
      } else if (ex?.status === 'running') {
        msg = `Digest for week ${weekMonday} is currently being sent by another process (started ${ex.started_at}). Refusing concurrent run.`
      } else if (ex?.status === 'failed') {
        msg = `Digest for week ${weekMonday} previously failed. Delete the digest_runs row for ${weekMonday} in Supabase to allow a retry.`
      }
      return { error: msg }
    }
  }

  // Lock acquired. Everything from here is wrapped in try/finally so the
  // lock row is always updated with a final status — even on early
  // error-returns or uncaught exceptions.
  let lockFinalStatus: 'completed' | 'failed' = 'failed'
  let lockSentCount = 0
  let lockFailedCount = 0
  let lockRecipientsCount = 0
  let lockErrorMessage: string | null = null

  try {
  // 4. Fetch production details
  const { data: productions } = await supabase
    .from('productions')
    .select(`
      id, title, slug,
      production_type_links(is_primary, production_types(name, slug)),
      production_status_links(is_primary, production_statuses(name, slug)),
      production_locations(location, city, stage, country, sort_order)
    `)
    .eq('visibility', 'publish')
    .in('id', productionIds)
    .order('title')

  const prods = (productions || []) as unknown as ProductionForDigest[]

  // 5. Build email HTML
  const productionsHtml = buildProductionsHtml(prods)
  const digestUrl = `https://productionlist.com/productions/week/${weekMonday}`

  const template = getTemplate('weekly-digest')
  if (!template) {
    lockErrorMessage = 'Template not found'
    return { error: 'Template not found' }
  }

  const vars = {
    firstName: '',
    weekDate,
    weekEndDate,
    productionCount: String(prods.length),
    digestUrl,
    productionsHtml,
  }

  const rendered = template.render(vars)

  // 6. Audience
  const { data: digestSettings } = await supabase
    .from('digest_settings')
    .select('send_to_audience')
    .eq('id', 1)
    .single()

  const audience = (digestSettings as any)?.send_to_audience || 'newsletter'

  const recipientEmails = new Set<string>()
  const emailToName = new Map<string, string>()

  emit({ phase: 'audience', message: `Fetching "${audience}" subscribers...` })

  // Fetch subscribers from Supabase (paginated).
  //
  // CRITICAL: .order('id') is required, not cosmetic. Postgres does not
  // guarantee stable row order across separate `.range()` queries unless an
  // ORDER BY is supplied — between page calls a hot-update, autovacuum, or
  // concurrent insert can shift the heap scan order, causing some rows to be
  // returned twice (the Set collapses them) and others to be skipped entirely.
  // Without this clause we silently lost ~18% of our active audience on every
  // weekly send.
  {
    let page = 0
    const PAGE_SIZE = 1000
    while (true) {
      const { data } = await supabase
        .from('newsletter_subscribers')
        .select('email, first_name')
        .eq('unsubscribed', false)
        .order('id', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      if (!data || data.length === 0) break
      for (const row of data as any[]) {
        if (row.email) {
          recipientEmails.add(row.email.toLowerCase())
          if (row.first_name) emailToName.set(row.email.toLowerCase(), row.first_name)
        }
      }
      if (data.length < PAGE_SIZE) break
      page++
    }
  }

  const totalFetchedFromAudience = recipientEmails.size

  if (recipientEmails.size === 0) {
    emit({ phase: 'error', error: `No contacts found in the "${audience}" audience.` })
    lockErrorMessage = `No contacts found in the "${audience}" audience`
    return { error: `No contacts found in the "${audience}" audience to send digest to.` }
  }

  emit({ phase: 'dedup', message: `Found ${totalFetchedFromAudience} recipients. Checking for duplicates...` })

  // 7. Exclude already-sent recipients (within 1 day before week start)
  const weekMondayStart = new Date(weekMonday + 'T00:00:00Z')
  const dedupWindowStart = new Date(weekMondayStart)
  dedupWindowStart.setDate(dedupWindowStart.getDate() - 1)

  const alreadySent = new Set<string>()
  {
    // Same .order() requirement as the audience fetch above — without a
    // stable ORDER BY, paginated reads can skip rows and let already-sent
    // recipients leak through, resulting in duplicate digests.
    let sentPage = 0
    while (true) {
      const { data: sentLogs } = await supabase
        .from('email_logs')
        .select('recipient')
        .eq('template_slug', 'weekly-digest')
        .not('recipient', 'like', 'bulk:%')
        .gte('sent_at', dedupWindowStart.toISOString())
        .order('id', { ascending: true })
        .range(sentPage * 1000, sentPage * 1000 + 999)
      if (!sentLogs || sentLogs.length === 0) break
      for (const log of sentLogs as any[]) {
        if (log.recipient) alreadySent.add(log.recipient.toLowerCase())
      }
      if (sentLogs.length < 1000) break
      sentPage++
    }
  }

  for (const email of alreadySent) {
    recipientEmails.delete(email)
  }

  if (recipientEmails.size === 0) {
    const result: PipelineResult = {
      success: true,
      message: `All ${alreadySent.size} recipients already received the digest this week.`,
      stats: {
        totalRecipients: 0,
        sent: 0,
        failed: 0,
        alreadySent: alreadySent.size,
        productionCount: prods.length,
        weekMonday,
        audienceFetched: totalFetchedFromAudience,
        audienceUsed: audience,
      },
    }
    emit({ phase: 'done', ...result })
    // Treat as completed — this week is done, don't retry.
    lockFinalStatus = 'completed'
    lockSentCount = 0
    lockFailedCount = 0
    lockRecipientsCount = 0
    return result
  }

  const emails = Array.from(recipientEmails)
  const BATCH_SIZE = 100
  const totalBatches = Math.ceil(emails.length / BATCH_SIZE)

  emit({
    phase: 'sending',
    message: `Sending to ${emails.length} recipients (${alreadySent.size} already sent, excluded)...`,
    total: emails.length,
    totalBatches,
    sent: 0,
    failed: 0,
  })

  // Lazy-load Resend so dry runs / zero-recipient paths don't pay the cost
  let resend: any = null
  if (!isDryRun) {
    const { Resend } = await import('resend')
    resend = new Resend(process.env.RESEND_API_KEY!)
  }

  let sent = 0
  let failed = 0
  const errors: string[] = []
  const fromAddress = 'Production List <weekly@updates.productionlist.com>'

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1

    if (isDryRun) {
      sent += batch.length
      emit({
        phase: 'batch',
        batch: batchNum,
        totalBatches,
        sent,
        failed: 0,
        total: emails.length,
        processed: Math.min(i + BATCH_SIZE, emails.length),
        dryRun: true,
      })
      await new Promise((resolve) => setTimeout(resolve, 200))
      continue
    }

    const emailPayloads = batch.map((email) => {
      const firstName = emailToName.get(email) || ''
      const personalVars = { ...vars, firstName, recipientEmail: email }
      const personalRendered = template.render(personalVars)
      const unsubUrl = `https://productionlist.com/unsubscribe?email=${encodeURIComponent(email)}`
      return {
        from: fromAddress,
        to: [email],
        subject: personalRendered.subject,
        html: personalRendered.html,
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }
    })

    let batchCounted = false
    try {
      const { data: batchData, error: batchError } = await resend.batch.send(emailPayloads)

      if (batchError) {
        console.error(`[weekly-digest] Batch SDK error:`, batchError)
        failed += batch.length
        batchCounted = true
        if (errors.length < 10) errors.push(`Batch ${batchNum}: ${batchError.message}`)

        try {
          const failEntries = batch.map((email, idx) => ({
            recipient: email,
            subject: emailPayloads[idx].subject,
            template_slug: 'weekly-digest',
            status: 'failed',
            resend_id: null,
            error_message: batchError.message,
            sent_at: new Date().toISOString(),
          }))
          await supabase.from('email_logs').insert(failEntries)
        } catch (logErr) {
          console.error(`[weekly-digest] Failed to log email_logs for failed batch:`, logErr)
        }

        try {
          const failActivityEntries = batch.map((email, idx) => ({
            email,
            event_type: 'email_sent',
            ip_address: null,
            user_agent: 'Weekly Digest Sender',
            country: null, city: null, region: null,
            metadata: {
              subject: emailPayloads[idx].subject,
              template: 'weekly-digest',
              status: 'failed',
              error: batchError.message,
              trigger: triggerType,
              week_monday: weekMonday,
            },
          }))
          await supabase.from('activity_log').insert(failActivityEntries)
        } catch {
          // swallow
        }
      } else {
        const results = batchData?.data ?? []
        sent += results.length
        const batchFailed = batch.length - results.length
        failed += batchFailed
        batchCounted = true

        try {
          const logEntries = batch.map((email, idx) => ({
            recipient: email,
            subject: emailPayloads[idx].subject,
            template_slug: 'weekly-digest',
            status: idx < results.length ? 'sent' : 'failed',
            resend_id: results[idx]?.id ?? null,
            error_message: null,
            sent_at: new Date().toISOString(),
          }))
          await supabase.from('email_logs').insert(logEntries)
        } catch (logErr) {
          console.error(`[weekly-digest] Failed to log email_logs for batch:`, logErr)
        }

        try {
          const activityEntries = batch
            .filter((_, idx) => idx < results.length)
            .map((email, idx) => ({
              email,
              event_type: 'email_sent',
              ip_address: null,
              user_agent: 'Weekly Digest Sender',
              country: null, city: null, region: null,
              metadata: {
                subject: emailPayloads[idx].subject,
                template: 'weekly-digest',
                resend_id: results[idx]?.id ?? null,
                trigger: triggerType,
                week_monday: weekMonday,
              },
            }))
          if (activityEntries.length > 0) {
            await supabase.from('activity_log').insert(activityEntries)
          }
        } catch {
          // swallow
        }
      }
    } catch (err: any) {
      if (!batchCounted) {
        failed += batch.length
      }
      if (errors.length < 10) errors.push(`Batch ${batchNum}: ${err.message}`)
    }

    emit({
      phase: 'batch',
      batch: batchNum,
      totalBatches,
      sent,
      failed,
      total: emails.length,
      processed: Math.min(i + BATCH_SIZE, emails.length),
    })

    if (i + BATCH_SIZE < emails.length) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  // Bulk summary log row
  if (!isDryRun) {
    await supabase.from('email_logs').insert({
      recipient: `bulk:${emails.length}`,
      subject: rendered.subject,
      template_slug: 'weekly-digest',
      status: 'sent',
      error_message: errors.length > 0 ? errors.join('; ') : null,
      resend_id: JSON.stringify({
        trigger: triggerType,
        sent,
        failed,
        productionCount: prods.length,
        weekMonday,
        audience,
      }),
      sent_at: new Date().toISOString(),
    })
  }

  const dryLabel = isDryRun ? '[DRY RUN] ' : ''
  const result: PipelineResult = {
    success: true,
    dryRun: isDryRun,
    message: `${dryLabel}Digest ${isDryRun ? 'would be sent' : 'sent'} to ${sent} of ${emails.length} recipients (${failed} failed). ${totalFetchedFromAudience} in audience, ${alreadySent.size} already sent this week.`,
    stats: {
      totalRecipients: emails.length,
      sent,
      failed,
      productionCount: prods.length,
      weekMonday,
      audienceFetched: totalFetchedFromAudience,
      alreadySentCount: alreadySent.size,
      audienceUsed: audience,
    },
    ...(errors.length > 0 ? { errors } : {}),
  }

  emit({ phase: 'done', ...result })
  // Mark lock completed with final counts
  lockFinalStatus = 'completed'
  lockSentCount = sent
  lockFailedCount = failed
  lockRecipientsCount = emails.length
  if (errors.length > 0) {
    lockErrorMessage = errors.slice(0, 3).join('; ')
  }
  return result
  } catch (err: any) {
    lockErrorMessage = err?.message || 'Unknown error in weekly digest pipeline'
    throw err
  } finally {
    if (!isDryRun) {
      try {
        await supabase
          .from('digest_runs')
          .update({
            status: lockFinalStatus,
            finished_at: new Date().toISOString(),
            sent_count: lockSentCount,
            failed_count: lockFailedCount,
            recipients_count: lockRecipientsCount,
            error_message: lockErrorMessage,
          })
          .eq('week_monday', weekMonday)
      } catch (releaseErr) {
        console.error('[weekly-digest] Failed to update digest_runs lock:', releaseErr)
      }
    }
  }
}
