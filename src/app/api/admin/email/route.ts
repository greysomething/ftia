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
        case 'productionCount': sampleVars[v] = '24'; break
        case 'digestUrl': sampleVars[v] = 'https://productionlist.com/production-list'; break
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

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
