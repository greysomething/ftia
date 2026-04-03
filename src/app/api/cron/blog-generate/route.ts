/**
 * GET /api/cron/blog-generate
 *
 * Vercel Cron handler — runs every 8 hours (3x/day).
 * Checks blog_generation_settings to see if auto-generation is enabled,
 * then processes pending queue items up to the configured batch size.
 *
 * Target: ~1.5 posts/day → 2 posts per batch, 3 batches/day = 6 max,
 * but the queue self-limits based on available pending items.
 *
 * Protected by CRON_SECRET to prevent unauthorized triggers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getPromptConfig } from '@/lib/ai-prompts'
import { slugify } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Load settings
  const { data: settingsRows } = await supabase
    .from('blog_generation_settings')
    .select('key, value')
  const settings: Record<string, string> = {}
  for (const s of settingsRows ?? []) settings[s.key] = s.value

  // Check if enabled
  if (settings.enabled !== 'true') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Blog generation disabled' })
  }

  // Check daily rate limit — count posts generated today
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const { count: todayCount } = await supabase
    .from('blog_generation_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('completed_at', todayStart.toISOString())

  const postsPerDay = parseFloat(settings.posts_per_day || '1.5')
  const maxToday = Math.ceil(postsPerDay)
  if ((todayCount ?? 0) >= maxToday) {
    return NextResponse.json({
      ok: true, skipped: true,
      reason: `Already generated ${todayCount} posts today (limit: ${maxToday})`,
    })
  }

  const remaining = maxToday - (todayCount ?? 0)
  const batchSize = Math.min(parseInt(settings.batch_size || '2', 10), remaining)

  // Auto-populate queue if it's running low
  const { count: pendingCount } = await supabase
    .from('blog_generation_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  if ((pendingCount ?? 0) < batchSize) {
    // Auto-populate with eligible productions
    await autoPopulateQueue(supabase, settings)
  }

  // Fetch pending items
  const { data: items } = await supabase
    .from('blog_generation_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(batchSize)

  if (!items?.length) {
    return NextResponse.json({ ok: true, processed: 0, reason: 'No pending items in queue' })
  }

  const apiKey = process.env.SCANNER_ANTHROPIC_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI API key not configured' }, { status: 500 })
  }

  const config = await getPromptConfig('blog_generation')
  const autoPublish = settings.auto_publish === 'true'

  const results: any[] = []
  for (const item of items) {
    try {
      const result = await processQueueItem(item, supabase, apiKey, config, autoPublish)
      results.push(result)
    } catch (err: any) {
      results.push({ productionId: item.production_id, status: 'failed', error: err.message })
    }
  }

  console.log(`[blog-generate cron] Processed ${results.length} items:`,
    results.map(r => `${r.productionId}: ${r.status}`).join(', '))

  return NextResponse.json({ ok: true, processed: results.length, results })
}

async function autoPopulateQueue(
  supabase: ReturnType<typeof createAdminClient>,
  settings: Record<string, string>,
) {
  const minScore = parseInt(settings.min_production_data_score || '3', 10)
  const excludeTypes: string[] = JSON.parse(settings.exclude_types || '[]')

  // Get already-queued and already-linked production IDs
  const { data: existingQueue } = await supabase
    .from('blog_generation_queue')
    .select('production_id')
  const queuedIds = new Set((existingQueue ?? []).map((q: any) => q.production_id))

  const { data: linkedBlog } = await supabase
    .from('productions')
    .select('id')
    .not('blog_linked', 'is', null)
  const linkedIds = new Set((linkedBlog ?? []).map((p: any) => p.id))

  // Fetch recent productions
  const { data: productions } = await supabase
    .from('productions')
    .select(`
      id, title, excerpt, content, computed_status,
      production_date_start, production_date_end,
      production_crew_roles(id),
      production_company_links(id),
      production_locations(id),
      production_type_links(production_types(name))
    `)
    .order('updated_at', { ascending: false })
    .limit(100)

  const candidates: { production_id: number }[] = []
  for (const p of productions ?? []) {
    if (queuedIds.has(p.id) || linkedIds.has(p.id)) continue

    const typeNames = (p.production_type_links as any[])?.map(
      (tm: any) => tm.production_types?.name
    ).filter(Boolean) ?? []
    if (excludeTypes.length && typeNames.some((t: string) => excludeTypes.includes(t))) continue

    // Skip productions without a start date at least 30 days in the future
    if (!p.production_date_start) continue
    const startDate = new Date(p.production_date_start)
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
    if (startDate < thirtyDaysFromNow) continue

    let score = 0
    if (p.title) score++
    if (p.excerpt) score++
    if (p.content) score++
    if (p.computed_status) score++
    if ((p.production_crew_roles as any[])?.length > 0) score++
    if ((p.production_company_links as any[])?.length > 0) score++
    if ((p.production_locations as any[])?.length > 0) score++
    if (p.production_date_start) score++

    if (score >= minScore) candidates.push({ production_id: p.id })
  }

  if (candidates.length > 0) {
    const rows = candidates.slice(0, 20).map(c => ({
      production_id: c.production_id,
      status: 'pending' as const,
    }))
    await supabase
      .from('blog_generation_queue')
      .upsert(rows, { onConflict: 'production_id', ignoreDuplicates: true })
  }
}

async function processQueueItem(
  item: any,
  supabase: ReturnType<typeof createAdminClient>,
  apiKey: string,
  config: { prompt: string; model: string; max_tokens: number },
  autoPublish: boolean,
) {
  const productionId = item.production_id

  // Mark as generating
  await supabase
    .from('blog_generation_queue')
    .update({ status: 'generating', started_at: new Date().toISOString(), attempts: item.attempts + 1 })
    .eq('id', item.id)

  // Fetch full production data
  const { data: prod } = await supabase
    .from('productions')
    .select(`
      id, title, slug, excerpt, content, computed_status,
      production_date_start, production_date_end,
      production_crew_roles(role_name, inline_name),
      production_company_links(inline_name),
      production_locations(location, city, stage, country),
      production_type_links(production_types(name)),
      production_status_links(production_statuses(name))
    `)
    .eq('id', productionId)
    .single()

  if (!prod) {
    await supabase.from('blog_generation_queue')
      .update({ status: 'failed', error: 'Production not found', completed_at: new Date().toISOString() })
      .eq('id', item.id)
    return { productionId, status: 'failed', error: 'Production not found' }
  }

  // Build context
  const context: string[] = [`Project Title: ${prod.title}`]
  const typeNames = (prod.production_type_links as any[])?.map((tm: any) => tm.production_types?.name).filter(Boolean) ?? []
  const statusNames = (prod.production_status_links as any[])?.map((sm: any) => sm.production_statuses?.name).filter(Boolean) ?? []

  if (typeNames.length) context.push(`Type: ${typeNames.join(', ')}`)
  if (statusNames.length) context.push(`Status: ${statusNames.join(', ')}`)
  if (prod.computed_status) context.push(`Phase: ${prod.computed_status}`)
  if (prod.production_date_start) context.push(`Production Start: ${prod.production_date_start}`)
  if (prod.production_date_end) context.push(`Production End: ${prod.production_date_end}`)
  if (prod.excerpt) context.push(`Logline: ${prod.excerpt}`)
  if (prod.content) context.push(`Description: ${prod.content}`)

  const crew = prod.production_crew_roles as any[]
  if (crew?.length) context.push(`Key Crew:\n${crew.map((c: any) => `  - ${c.role_name}: ${c.inline_name}`).join('\n')}`)
  const companies = prod.production_company_links as any[]
  if (companies?.length) context.push(`Production Companies: ${companies.map((c: any) => c.inline_name).join(', ')}`)
  const locations = prod.production_locations as any[]
  if (locations?.length) context.push(`Filming Locations:\n${locations.map((l: any) => `  - ${[l.location, l.city, l.stage, l.country].filter(Boolean).join(', ')}`).join('\n')}`)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.max_tokens,
        messages: [{ role: 'user', content: `${config.prompt}\n\nHere is the production data to write about:\n\n${context.join('\n')}` }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`AI API error: ${response.status}`)
    }

    const result = await response.json()
    const text = result.content?.[0]?.text ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('AI did not return valid JSON')

    const blogData = JSON.parse(jsonMatch[0])

    // Save blog post
    let slug = slugify(blogData.title || prod.title)
    const { data: existingSlug } = await supabase.from('blog_posts').select('id').eq('slug', slug).maybeSingle()
    if (existingSlug) {
      let suffix = 2
      while (true) {
        const candidate = `${slug}-${suffix}`
        const { data: collision } = await supabase.from('blog_posts').select('id').eq('slug', candidate).maybeSingle()
        if (!collision) { slug = candidate; break }
        suffix++
        if (suffix > 20) { slug = `${slug}-${Date.now()}`; break }
      }
    }

    // Wrap the first paragraph in an H4 heading
    if (blogData.content) {
      blogData.content = blogData.content.replace(/^<p>([\s\S]*?)<\/p>/, '<h5>$1</h5>')
    }

    // Append CTA linking to the production page
    if (prod.slug) {
      const ctaHtml = `<p style="text-align:center"><strong><a href="/production/${prod.slug}">Click here</a> for production info or to contact producers</strong></p>`
      blogData.content = (blogData.content || '') + '\n' + ctaHtml
    }

    const visibility = autoPublish ? 'publish' : 'draft'
    const { data: blogPost, error: insertErr } = await supabase
      .from('blog_posts')
      .insert({
        title: blogData.title || prod.title,
        slug,
        content: blogData.content || '',
        excerpt: blogData.excerpt || '',
        visibility,
        published_at: autoPublish ? new Date().toISOString() : null,
      })
      .select('id, slug, title')
      .single()

    if (insertErr) throw new Error(`Failed to save: ${insertErr.message}`)

    // Assign "Project Alerts" category by default
    const { data: projectAlertsCat } = await supabase
      .from('blog_categories')
      .select('id')
      .eq('slug', 'project-alerts')
      .single()
    if (projectAlertsCat) {
      await supabase.from('blog_post_categories')
        .upsert({ post_id: blogPost.id, category_id: projectAlertsCat.id }, { onConflict: 'post_id,category_id', ignoreDuplicates: true })
    }

    await supabase.from('productions').update({ blog_linked: blogPost.id }).eq('id', productionId)
    await supabase.from('blog_generation_queue').update({
      status: 'completed', blog_post_id: blogPost.id, completed_at: new Date().toISOString(),
    }).eq('id', item.id)

    return { productionId, status: 'completed', blogPostId: blogPost.id, title: blogPost.title }
  } catch (err: any) {
    await supabase.from('blog_generation_queue').update({
      status: 'failed', error: err.message?.slice(0, 500), completed_at: new Date().toISOString(),
    }).eq('id', item.id)
    return { productionId, status: 'failed', error: err.message }
  }
}
