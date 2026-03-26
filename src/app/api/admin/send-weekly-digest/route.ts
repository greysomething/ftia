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

    return `<tr style="background-color:${bgColor};">
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">
        <a href="https://productionlist.com/productions/${prod.slug}" style="color:${type ? '#2b7bb9' : '#2b7bb9'};text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(prod.title)}</a>
        ${type ? `<span style="color:#666;font-size:12px;font-weight:400;"> ${escapeHtml(type)}</span>` : ''}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#555;font-size:13px;white-space:nowrap;">
        ${escapeHtml(location)}
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

export async function POST(req: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(req.url)
  const isPreview = searchParams.get('preview') === 'true'
  const testEmail = searchParams.get('test')

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

  // 8. Full send — get all active members + newsletter subscribers
  // Get active member emails
  const { data: memberships } = await supabase
    .from('user_memberships')
    .select('user_id')
    .eq('status', 'active')

  const memberUserIds = [...new Set((memberships || []).map((m: any) => m.user_id))]

  // Get user profiles with emails
  const recipientEmails = new Set<string>()
  const emailToName = new Map<string, string>()

  if (memberUserIds.length > 0) {
    // Batch fetch in chunks of 500
    for (let i = 0; i < memberUserIds.length; i += 500) {
      const chunk = memberUserIds.slice(i, i + 500)
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, first_name, email')
        .in('user_id', chunk)

      for (const p of profiles || []) {
        if (p.email) {
          recipientEmails.add(p.email)
          if (p.first_name) emailToName.set(p.email, p.first_name)
        }
      }
    }
  }

  // Also get newsletter subscribers from Resend audience (if configured)
  // For now, we send to active members only

  if (recipientEmails.size === 0) {
    return NextResponse.json(
      { error: 'No active members found to send digest to.' },
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
      const result = await sendEmail({
        to: email,
        subject: personalRendered.subject,
        html: personalRendered.html,
        templateSlug: 'weekly-digest',
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

    // Rate limiting — Resend allows 10 emails/second on most plans
    if (sent % 8 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  // 10. Log summary
  await supabase.from('email_logs').insert({
    recipient: `bulk:${emails.length}`,
    subject: rendered.subject,
    template_slug: 'weekly-digest',
    status: 'sent',
    error_message: errors.length > 0 ? errors.join('; ') : null,
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
