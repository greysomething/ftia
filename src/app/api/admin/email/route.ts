import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/send-email'
import { getTemplate, emailTemplates } from '@/lib/email-templates'

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
          // Fetch contacts list to get actual count
          const res = await fetch(`https://api.resend.com/audiences/${aud.id}/contacts`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          })
          if (res.ok) {
            const data = await res.json()
            const contacts = data.data ?? []
            return {
              id: aud.id,
              label: aud.label,
              contactCount: contacts.length,
            }
          }
        } catch { /* skip */ }
        return { id: aud.id, label: aud.label, contactCount: 0 }
      })
    )

    return NextResponse.json({ audiences })
  }

  if (action === 'digest-stats') {
    const supabase = createAdminClient()

    // Fetch all weekly-digest logs (both individual sends and bulk summaries)
    const allDigestLogs: Array<{
      recipient: string
      status: string
      sent_at: string
      error_message: string | null
    }> = []

    let dPage = 0
    while (true) {
      const { data } = await supabase
        .from('email_logs')
        .select('recipient, status, sent_at, error_message')
        .eq('template_slug', 'weekly-digest')
        .order('sent_at', { ascending: false })
        .range(dPage * 1000, dPage * 1000 + 999)
      if (!data || data.length === 0) break
      allDigestLogs.push(...data)
      if (data.length < 1000) break
      dPage++
    }

    // Group bulk sends by week (bulk entries have recipient like "bulk:123")
    const sends: Array<{
      week: string
      total: number
      sent: number
      failed: number
      date: string
    }> = []

    let totalSent = 0
    let totalFailed = 0
    let lastSentAt: string | null = null

    for (const log of allDigestLogs) {
      if (log.recipient.startsWith('bulk:')) {
        const totalRecipients = parseInt(log.recipient.replace('bulk:', ''), 10) || 0
        const failedCount = log.error_message
          ? (log.error_message.split(';').length)
          : 0
        const sentCount = totalRecipients - failedCount

        const sentDate = new Date(log.sent_at)
        const weekLabel = sentDate.toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        })

        sends.push({
          week: `Week of ${weekLabel}`,
          total: totalRecipients,
          sent: sentCount,
          failed: failedCount,
          date: weekLabel,
        })

        totalSent += sentCount
        totalFailed += failedCount
        if (!lastSentAt) lastSentAt = log.sent_at
      }
    }

    const avgPerWeek = sends.length > 0
      ? sends.reduce((s, d) => s + d.total, 0) / sends.length
      : 0

    return NextResponse.json({
      sends,
      totalSent,
      totalFailed,
      avgPerWeek,
      lastSentAt,
      cronEnabled: true,
    })
  }

  // Default: logs
  const supabase = createAdminClient()
  const statusFilter = req.nextUrl.searchParams.get('status')
  const templateFilter = req.nextUrl.searchParams.get('template')
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
