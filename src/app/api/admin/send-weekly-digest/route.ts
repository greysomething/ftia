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

export const maxDuration = 300 // 5 minutes for bulk sends

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

  // Helper: fetch contacts from a Resend audience
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)

  const AUDIENCE_IDS: Record<string, string> = {
    newsletter: '4eaf097c-c05c-4f20-b5c6-064a5e7630fe',
    active_members: '90a19517-19e0-44ac-90ea-847ef90c97a7',
    past_members: '429350f9-9dd2-4af9-8089-e6c85c428b54',
  }

  async function fetchResendAudience(audienceId: string) {
    try {
      const { data } = await resend.contacts.list({ audienceId })
      const contacts = (data as any)?.data ?? data ?? []
      for (const contact of contacts) {
        if (contact.email && !contact.unsubscribed) {
          recipientEmails.add(contact.email)
          if (contact.firstName) emailToName.set(contact.email, contact.firstName)
        }
      }
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

  if (recipientEmails.size === 0) {
    return NextResponse.json(
      { error: `No contacts found in the "${audience}" audience to send digest to.` },
      { status: 400 }
    )
  }

  // 9. Send emails in batches
  let sent = 0
  let failed = 0
  const errors: string[] = []
  const emails = Array.from(recipientEmails)

  // Send individually so we can personalize with firstName
  for (const email of emails) {
    const firstName = emailToName.get(email) || ''
    const personalVars = { ...vars, firstName, recipientEmail: email }
    const personalRendered = template.render(personalVars)

    try {
      const unsubUrl = `https://productionlist.com/unsubscribe?email=${encodeURIComponent(email)}`
      const result = await sendEmail({
        to: email,
        subject: personalRendered.subject,
        html: personalRendered.html,
        templateSlug: 'weekly-digest',
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      })

      if (result.success) {
        sent++
      } else {
        failed++
        if (errors.length < 10) errors.push(`${email}: ${result.error}`)
      }
    } catch (err: any) {
      failed++
      if (errors.length < 10) errors.push(`${email}: ${err.message}`)
    }

    // Rate limiting — Resend allows 2/sec on free, 10/sec on Pro.
    // Send in bursts of 5 with 1s pause to stay well under limits
    // and avoid triggering ISP spam filters with too many rapid sends.
    if ((sent + failed) % 5 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1200))
    }
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
    message: `Weekly digest sent to ${sent} members (${failed} failed). ${prods.length} productions listed.`,
    stats: {
      totalRecipients: emails.length,
      sent,
      failed,
      productionCount: prods.length,
      weekMonday,
    },
    ...(errors.length > 0 ? { errors } : {}),
  })
}
