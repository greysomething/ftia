/**
 * POST /api/admin/send-weekly-digest
 *
 * Sends the Weekly Production Digest email to all active members
 * and newsletter subscribers. Only fires when the current week's
 * production list has 40+ productions.
 *
 * The actual send pipeline lives in src/lib/weekly-digest.ts and is
 * shared with the cron route. This handler only owns:
 *   - auth (admin session OR x-cron-secret)
 *   - preview mode (?preview=true returns HTML)
 *   - test mode (?test=email@example.com sends single)
 *   - streaming mode (?stream=true returns SSE)
 *   - dry run passthrough (?dry_run=true)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/send-email'
import { getTemplate } from '@/lib/email-templates'
import { getAdminUser } from '@/lib/auth'
import {
  ProductionForDigest,
  getCurrentWeekMonday,
  formatWeekDate,
  formatWeekEndDate,
  buildProductionsHtml,
  runWeeklyDigestPipeline,
} from '@/lib/weekly-digest'

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
  const isStream = searchParams.get('stream') === 'true'
  const isDryRun = searchParams.get('dry_run') === 'true'
  const triggerType: 'auto' | 'manual' =
    (searchParams.get('trigger') as 'auto' | 'manual') || (isCron ? 'auto' : 'manual')

  // Preview and test modes need to build the HTML locally (they short-circuit
  // before the shared pipeline). Everything else delegates to runWeeklyDigestPipeline.
  if (isPreview || testEmail) {
    const weekMonday = getCurrentWeekMonday()
    const weekDate = formatWeekDate(weekMonday)
    const weekEndDate = formatWeekEndDate(weekMonday)

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

    const productionIds = (weekEntries as any[]).map((e) => e.production_id)

    // Threshold check is skipped for preview/test so admins can always preview.

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

    if (isPreview) {
      const rendered = template.render(vars)
      return new NextResponse(rendered.html, {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    // Test mode — send to a single address
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
  }

  // Full send — streaming mode (SSE progress events)
  if (isStream) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        function emit(event: Record<string, any>) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }
        try {
          await runWeeklyDigestPipeline({ triggerType, isDryRun, emit })
        } catch (err: any) {
          emit({ phase: 'error', error: err.message || 'Unknown error' })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }

  // Non-streaming full send
  try {
    const result = await runWeeklyDigestPipeline({ triggerType, isDryRun })
    if (result.error && !result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Unexpected error' },
      { status: 500 }
    )
  }
}

