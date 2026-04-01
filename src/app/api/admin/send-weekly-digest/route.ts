/**
 * POST /api/admin/send-weekly-digest
 *
 * Sends the Weekly Production Digest email to all active members
 * and newsletter subscribers. Only fires when the current week's
 * production list has 40+ productions.
 *
 * Query params:
 *   ?preview=true  — returns rendered HTML without sending
 *   ?test=email@example.com — sends to a single address for testing
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/send-email'
import { getTemplate } from '@/lib/email-templates'
import { getAdminUser } from '@/lib/auth'

const MIN_PRODUCTIONS = 40

interface ProductionForDigest {
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

function getCurrentWeekMonday(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  return monday.toISOString().split('T')[0]
}

function formatWeekDate(mondayStr: string): string {
  const monday = new Date(mondayStr + 'T00:00:00')
  return monday.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatWeekEndDate(mondayStr: string): string {
  const monday = new Date(mondayStr + 'T00:00:00')
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return sunday.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function getProductionType(prod: ProductionForDigest): string {
  const primary = prod.production_type_links?.find((l) => l.is_primary)
  if (primary?.production_types?.name) return primary.production_types.name
  const first = prod.production_type_links?.[0]
  if (first?.production_types?.name) return first.production_types.name
  return ''
}

function getLocationString(prod: ProductionForDigest): string {
  const locs = prod.production_locations || []
  if (locs.length === 0) return ''

  // Sort by sort_order
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

function buildProductionsHtml(productions: ProductionForDigest[]): string {
  if (!productions.length) return ''

  const rows = productions.map((prod, i) => {
    const type = getProductionType(prod)
    const location = getLocationString(prod)
    const bgColor = i % 2 === 0 ? '#ffffff' : '#f9fafb'

    // Single-column stacked layout — works well on both desktop and mobile
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const maxDuration = 300 // 5 minutes — Vercel Pro max for serverless functions

export async function POST(req: NextRequest) {
  // Auth: either admin user session OR cron secret
  const cronSecret = req.headers.get('x-cron-secret')
  const isCron = cronSecret && cronSecret === process.env.CRON_SECRET
  if (!isCron) {
    const user = await getAdminUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { searchParams } = new URL(req.url)
  const isPreview = searchParams.get('preview') === 'true'
  const testEmail = searchParams.get('test')
  const triggerType = searchParams.get('trigger') || (isCron ? 'auto' : 'manual')

  // 1. Get current week's Monday
  const weekMonday = getCurrentWeekMonday()
  const weekDate = formatWeekDate(weekMonday)
  const weekEndDate = formatWeekEndDate(weekMonday)

  // 2. Fetch productions for this week
  const { data: weekEntries } = await supabase
    .from('production_week_entries')
    .select('production_id')
    .eq('week_monday', weekMonday)

  if (!weekEntries || weekEntries.length === 0) {
    return NextResponse.json(
      { error: 'No productions found for the current week.' },
      { status: 400 }
    )
  }

  const productionIds = weekEntries.map((e: any) => e.production_id)

  // 3. Check minimum production threshold
  if (productionIds.length < MIN_PRODUCTIONS && !testEmail && !isPreview) {
    return NextResponse.json(
      {
        error: `Current week has ${productionIds.length} productions. Minimum ${MIN_PRODUCTIONS} required before sending digest.`,
        count: productionIds.length,
      },
      { status: 400 }
    )
  }

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

  // 5. Build the email HTML
  const productionsHtml = buildProductionsHtml(prods)
  const digestUrl = `https://productionlist.com/productions/week/${weekMonday}`

  const template = getTemplate('weekly-digest')
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 500 })
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

  // 6. Preview mode — return HTML without sending
  if (isPreview) {
    return new NextResponse(rendered.html, {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  // 7. Test mode — send to single email
  if (testEmail) {
    const personalVars = { ...vars, firstName: 'Test User', recipientEmail: testEmail }
    const personalRendered = template.render(personalVars)

    const result = await sendEmail({
      to: testEmail,
      subject: personalRendered.subject,
      html: personalRendered.html,
      templateSlug: 'weekly-digest',
    })

    return NextResponse.json({
      success: result.success,
      message: result.success
        ? `Test digest sent to ${testEmail}`
        : `Failed: ${result.error}`,
      productionCount: prods.length,
    })
  }

  // 8. Full send — get recipients based on send_to_audience setting
  const { data: digestSettings } = await supabase
    .from('digest_settings')
    .select('send_to_audience')
    .eq('id', 1)
    .single()

  const audience = digestSettings?.send_to_audience || 'newsletter'

  const recipientEmails = new Set<string>()
  const emailToName = new Map<string, string>()

  // Use env vars for audience IDs (same as audience-counts endpoint)
  const AUDIENCE_IDS: Record<string, string> = {
    newsletter: process.env.RESEND_AUDIENCE_ID ?? '',
    active_members: process.env.RESEND_AUDIENCE_MEMBERS_ID ?? '',
    past_members: process.env.RESEND_AUDIENCE_PAST_MEMBERS_ID ?? '',
  }

  const resendApiKey = process.env.RESEND_API_KEY!

  async function fetchResendAudience(audienceId: string) {
    try {
      let hasMore = true
      let afterCursor: string | undefined
      let pageCount = 0

      while (hasMore) {
        // Use raw API to avoid SDK response wrapping issues
        const url = new URL(`https://api.resend.com/audiences/${audienceId}/contacts`)
        url.searchParams.set('limit', '100')
        if (afterCursor) url.searchParams.set('after', afterCursor)

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${resendApiKey}` },
        })

        if (!res.ok) {
          console.error(`[send-weekly-digest] Resend API error: ${res.status} ${res.statusText}`)
          break
        }

        const data = await res.json()
        const contacts = data.data ?? []
        pageCount++

        console.log(`[send-weekly-digest] Audience ${audienceId} page ${pageCount}: ${contacts.length} contacts, has_more=${data.has_more}`)

        if (!Array.isArray(contacts) || contacts.length === 0) break

        for (const contact of contacts) {
          if (contact.email && !contact.unsubscribed) {
            const normalizedEmail = contact.email.toLowerCase()
            recipientEmails.add(normalizedEmail)
            if (contact.first_name) emailToName.set(normalizedEmail, contact.first_name)
          }
        }

        hasMore = data.has_more === true
        if (hasMore && contacts.length > 0) {
          afterCursor = contacts[contacts.length - 1].id
        } else {
          hasMore = false
        }
      }

      console.log(`[send-weekly-digest] Audience ${audienceId} total: ${pageCount} pages fetched`)
    } catch (err) {
      console.error(`[send-weekly-digest] Failed to fetch audience ${audienceId}:`, err)
    }
  }

  // Fetch contacts based on selected audience
  if (audience === 'newsletter' || audience === 'all' || audience === 'all_subscribers') {
    await fetchResendAudience(AUDIENCE_IDS.newsletter)
  }
  if (audience === 'active_members' || audience === 'active_and_past' || audience === 'all') {
    await fetchResendAudience(AUDIENCE_IDS.active_members)
  }
  if (audience === 'past_members' || audience === 'active_and_past' || audience === 'all') {
    await fetchResendAudience(AUDIENCE_IDS.past_members)
  }

  const totalFetchedFromAudience = recipientEmails.size
  console.log(`[send-weekly-digest] Total unique recipients from audience(s): ${totalFetchedFromAudience}`)

  if (recipientEmails.size === 0) {
    return NextResponse.json(
      { error: `No contacts found in the "${audience}" audience to send digest to.` },
      { status: 400 }
    )
  }

  // 8b. Exclude recipients who already received the digest for this weekMonday
  //     This prevents double-sends on retry and allows resuming to send to remaining recipients.
  //     Uses weekMonday (not calendar week) so the dedup boundary matches the digest content.
  const weekMondayStart = new Date(weekMonday + 'T00:00:00Z')
  // Look back from the Monday to catch any early sends, and forward to cover the full week
  const dedupWindowStart = new Date(weekMondayStart)
  dedupWindowStart.setDate(dedupWindowStart.getDate() - 1) // Sunday before

  const alreadySent = new Set<string>()
  let sentPage = 0
  while (true) {
    const { data: sentLogs } = await supabase
      .from('email_logs')
      .select('recipient')
      .eq('template_slug', 'weekly-digest')
      .not('recipient', 'like', 'bulk:%')
      .gte('sent_at', dedupWindowStart.toISOString())
      .range(sentPage * 1000, sentPage * 1000 + 999)
    if (!sentLogs || sentLogs.length === 0) break
    for (const log of sentLogs) {
      if (log.recipient) alreadySent.add(log.recipient.toLowerCase())
    }
    if (sentLogs.length < 1000) break
    sentPage++
  }

  // Remove already-sent recipients (recipientEmails is already lowercase)
  for (const email of alreadySent) {
    recipientEmails.delete(email)
  }

  console.log(`[send-weekly-digest] After excluding ${alreadySent.size} already sent: ${recipientEmails.size} remaining`)

  if (recipientEmails.size === 0) {
    return NextResponse.json({
      success: true,
      message: `All ${alreadySent.size} recipients already received the digest this week. Nothing new to send. (Audience "${audience}" had ${totalFetchedFromAudience} contacts total.)`,
      stats: { totalRecipients: 0, sent: 0, failed: 0, alreadySent: alreadySent.size, productionCount: prods.length, weekMonday, audienceFetched: totalFetchedFromAudience, audienceUsed: audience },
    })
  }

  // 9. Send emails in batches using Resend SDK batch API (up to 100 per request)
  const { Resend } = await import('resend')
  const resend = new Resend(resendApiKey)

  let sent = 0
  let failed = 0
  const errors: string[] = []
  const emails = Array.from(recipientEmails)
  const BATCH_SIZE = 100
  const fromAddress = `Production List <${process.env.EMAIL_FROM ?? 'noreply@productionlist.com'}>`

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE)

    // Build per-recipient email objects with personalization
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

    try {
      const { data: batchData, error: batchError } = await resend.batch.send(emailPayloads)

      if (batchError) {
        console.error(`[send-weekly-digest] Batch SDK error:`, batchError)
        failed += batch.length
        if (errors.length < 10) errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchError.message}`)

        // Log failures to email_logs (catch to avoid double-counting in outer catch)
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
          console.error(`[send-weekly-digest] Failed to log email_logs for failed batch:`, logErr)
        }

        // Log failures to activity_log
        const failActivityEntries = batch.map((email, idx) => ({
          email,
          event_type: 'email_sent',
          ip_address: null,
          user_agent: 'Weekly Digest Sender',
          country: null,
          city: null,
          region: null,
          metadata: {
            subject: emailPayloads[idx].subject,
            template: 'weekly-digest',
            status: 'failed',
            error: batchError.message,
            trigger: triggerType,
            week_monday: weekMonday,
          },
        }))
        await supabase.from('activity_log').insert(failActivityEntries).catch(() => {})
      } else {
        const results = batchData?.data ?? []
        sent += results.length
        const batchFailed = batch.length - results.length
        failed += batchFailed

        // Log individual sends for per-recipient tracking (catch errors to avoid double-counting)
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
          console.error(`[send-weekly-digest] Failed to log email_logs for batch:`, logErr)
        }

        // Log to activity_log so digest sends show on user Activity Log pages
        const activityEntries = batch
          .filter((_, idx) => idx < results.length) // only successfully sent
          .map((email, idx) => ({
            email,
            event_type: 'email_sent',
            ip_address: null,
            user_agent: 'Weekly Digest Sender',
            country: null,
            city: null,
            region: null,
            metadata: {
              subject: emailPayloads[idx].subject,
              template: 'weekly-digest',
              resend_id: results[idx]?.id ?? null,
              trigger: triggerType,
              week_monday: weekMonday,
            },
          }))
        if (activityEntries.length > 0) {
          await supabase.from('activity_log').insert(activityEntries).catch(() => {})
        }
      }
    } catch (err: any) {
      failed += batch.length
      if (errors.length < 10) errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`)
    }

    // Brief pause between batches to respect rate limits
    if (i + BATCH_SIZE < emails.length) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    console.log(`[send-weekly-digest] Progress: ${sent + failed}/${emails.length} (${sent} sent, ${failed} failed)`)
  }

  // 10. Log summary (includes trigger type for audit trail)
  await supabase.from('email_logs').insert({
    recipient: `bulk:${emails.length}`,
    subject: rendered.subject,
    template_slug: 'weekly-digest',
    status: 'sent',
    error_message: errors.length > 0 ? errors.join('; ') : null,
    resend_id: JSON.stringify({
      trigger: triggerType,
      sent: sent,
      failed: failed,
      productionCount: prods.length,
      weekMonday,
      audience,
    }),
    sent_at: new Date().toISOString(),
  })

  return NextResponse.json({
    success: true,
    message: `Digest sent to ${sent} of ${emails.length} recipients (${failed} failed). ${totalFetchedFromAudience} in audience, ${alreadySent.size} already sent this week.`,
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
  })
}
