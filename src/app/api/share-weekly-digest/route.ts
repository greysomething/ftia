/**
 * POST /api/share-weekly-digest
 *
 * Sends the Weekly Production Digest email to a friend.
 * Reuses the same template and production data as the admin digest sender,
 * but is available to any logged-in member.
 *
 * Body: { recipientEmail, recipientName?, senderName?, weekMonday }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/send-email'
import { getTemplate } from '@/lib/email-templates'
import { getUser, isMember } from '@/lib/auth'

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

function formatWeekDate(mondayStr: string): string {
  const monday = new Date(mondayStr + 'T00:00:00')
  return monday.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatWeekEndDate(mondayStr: string): string {
  const monday = new Date(mondayStr + 'T00:00:00')
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return sunday.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
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
  const sorted = [...locs].sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))
  const parts: string[] = []
  for (const loc of sorted) {
    if (loc.city && loc.stage) parts.push(`${loc.city}, ${loc.stage}`)
    else if (loc.city && loc.country) parts.push(`${loc.city}, ${loc.country}`)
    else if (loc.city) parts.push(loc.city)
    else if (loc.location) parts.push(loc.location)
  }
  return parts.join(' / ')
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildProductionsHtml(productions: ProductionForDigest[]): string {
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
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px;">${rows.join('\n')}</table>`
}

// Simple in-memory rate limiter: max 5 shares per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

export async function POST(req: NextRequest) {
  // Must be a logged-in member
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Please log in to share.' }, { status: 401 })
  }
  const member = await isMember(user.id)
  if (!member) {
    return NextResponse.json({ error: 'Sharing is available to members only.' }, { status: 403 })
  }

  // Rate limit
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many shares. Please try again later.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { recipientEmail, recipientName, weekMonday } = body
  if (!recipientEmail || !weekMonday) {
    return NextResponse.json({ error: 'Email and week are required.' }, { status: 400 })
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
  }

  // Validate weekMonday format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekMonday)) {
    return NextResponse.json({ error: 'Invalid week date.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Fetch productions for that week
  const { data: weekEntries } = await supabase
    .from('production_week_entries')
    .select('production_id')
    .eq('week_monday', weekMonday)

  if (!weekEntries || weekEntries.length === 0) {
    return NextResponse.json({ error: 'No productions found for that week.' }, { status: 404 })
  }

  const productionIds = weekEntries.map((e: any) => e.production_id)

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

  // Build email using the same digest template
  const productionsHtml = buildProductionsHtml(prods)
  const digestUrl = `https://productionlist.com/productions/week/${weekMonday}`
  const weekDate = formatWeekDate(weekMonday)
  const weekEndDate = formatWeekEndDate(weekMonday)

  const template = getTemplate('weekly-digest')
  if (!template) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 500 })
  }

  const firstName = recipientName || ''
  const vars = {
    firstName,
    weekDate,
    weekEndDate,
    productionCount: String(prods.length),
    digestUrl,
    productionsHtml,
    recipientEmail,
  }

  const rendered = template.render(vars)

  // Get sender's name from their profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .single()

  const senderName = profile
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'A Production List member'
    : 'A Production List member'

  const subject = `${senderName} shared this week's Production List with you`

  const result = await sendEmail({
    to: recipientEmail,
    subject,
    html: rendered.html,
    templateSlug: 'weekly-digest-share',
    from: 'Production List <weekly@updates.productionlist.com>',
    headers: {
      'List-Unsubscribe': `<https://productionlist.com/unsubscribe?email=${encodeURIComponent(recipientEmail)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Failed to send email.' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: `Weekly digest sent to ${recipientEmail}`,
  })
}
