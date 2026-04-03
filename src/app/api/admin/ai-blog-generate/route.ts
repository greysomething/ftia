import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getPromptConfig } from '@/lib/ai-prompts'
import { slugify } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/admin/ai-blog-generate
 *
 * Processes pending items from the blog generation queue.
 * Supports two modes:
 *  - { mode: 'single', queueId: number } — generate one specific item
 *  - { mode: 'batch' } — process up to batch_size pending items
 *
 * Uses SSE streaming to report progress to the admin UI.
 */
export async function POST(req: NextRequest) {
  // Allow both admin UI calls and cron calls (cron uses CRON_SECRET)
  const isCron = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) {
    try { await requireAdmin() } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const apiKey = process.env.SCANNER_ANTHROPIC_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI API key not configured' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const mode = body.mode || 'batch'
  const singleQueueId = body.queueId as number | undefined

  const supabase = createAdminClient()

  // Load settings
  const { data: settingsRows } = await supabase
    .from('blog_generation_settings')
    .select('key, value')
  const settings: Record<string, string> = {}
  for (const s of settingsRows ?? []) settings[s.key] = s.value

  const batchSize = parseInt(settings.batch_size || '2', 10)
  const autoPublish = settings.auto_publish === 'true'

  // Load prompt config
  const config = await getPromptConfig('blog_generation')

  // Get queue items to process
  let items: any[] = []

  if (mode === 'single' && singleQueueId) {
    const { data } = await supabase
      .from('blog_generation_queue')
      .select('*')
      .eq('id', singleQueueId)
      .in('status', ['pending', 'failed'])
      .limit(1)
    items = data ?? []
  } else {
    const { data } = await supabase
      .from('blog_generation_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchSize)
    items = data ?? []
  }

  if (items.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No pending items' })
  }

  // Use SSE for real-time progress if called from admin UI
  const useSSE = req.headers.get('accept')?.includes('text/event-stream')

  if (useSSE) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        function send(event: string, data: any) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }

        send('start', { total: items.length })

        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          send('progress', { index: i, productionId: item.production_id, status: 'generating' })

          try {
            const result = await generateBlogForItem(item, supabase, apiKey, config, autoPublish)
            send('progress', {
              index: i,
              productionId: item.production_id,
              status: result.status,
              blogPostId: result.blogPostId,
              title: result.title,
              error: result.error,
            })
          } catch (err: any) {
            send('progress', {
              index: i,
              productionId: item.production_id,
              status: 'failed',
              error: err.message,
            })
          }
        }

        send('done', { processed: items.length })
        controller.close()
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

  // Non-SSE mode (cron, batch)
  const results: any[] = []
  for (const item of items) {
    try {
      const result = await generateBlogForItem(item, supabase, apiKey, config, autoPublish)
      results.push(result)
    } catch (err: any) {
      results.push({ productionId: item.production_id, status: 'failed', error: err.message })
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  })
}

async function generateBlogForItem(
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
    await supabase
      .from('blog_generation_queue')
      .update({ status: 'failed', error: 'Production not found', completed_at: new Date().toISOString() })
      .eq('id', item.id)
    return { productionId, status: 'failed', error: 'Production not found' }
  }

  // Build context string for the AI
  const context: string[] = [`Project Title: ${prod.title}`]
  const typeNames = (prod.production_type_links as any[])?.map(
    (tm: any) => tm.production_types?.name
  ).filter(Boolean) ?? []
  const statusNames = (prod.production_status_links as any[])?.map(
    (sm: any) => sm.production_statuses?.name
  ).filter(Boolean) ?? []

  if (typeNames.length) context.push(`Type: ${typeNames.join(', ')}`)
  if (statusNames.length) context.push(`Status: ${statusNames.join(', ')}`)
  if (prod.computed_status) context.push(`Phase: ${prod.computed_status}`)
  if (prod.production_date_start) context.push(`Production Start: ${prod.production_date_start}`)
  if (prod.production_date_end) context.push(`Production End: ${prod.production_date_end}`)
  if (prod.excerpt) context.push(`Logline: ${prod.excerpt}`)
  if (prod.content) context.push(`Description: ${prod.content}`)

  const crew = prod.production_crew_roles as any[]
  if (crew?.length) {
    context.push(`Key Crew:\n${crew.map((c: any) => `  - ${c.role_name}: ${c.inline_name}`).join('\n')}`)
  }
  const companies = prod.production_company_links as any[]
  if (companies?.length) {
    context.push(`Production Companies: ${companies.map((c: any) => c.inline_name).join(', ')}`)
  }
  const locations = prod.production_locations as any[]
  if (locations?.length) {
    context.push(`Filming Locations:\n${locations.map((l: any) => `  - ${[l.location, l.city, l.stage, l.country].filter(Boolean).join(', ')}`).join('\n')}`)
  }

  // Call AI
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
        messages: [
          {
            role: 'user',
            content: `${config.prompt}\n\nHere is the production data to write about:\n\n${context.join('\n')}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`AI API error: ${response.status} - ${err.slice(0, 200)}`)
    }

    const result = await response.json()
    const text = result.content?.[0]?.text ?? ''

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('AI did not return valid JSON')

    const blogData = JSON.parse(jsonMatch[0])

    // Save as blog post
    let slug = slugify(blogData.title || prod.title)

    // Ensure slug uniqueness
    const { data: existingSlug } = await supabase
      .from('blog_posts').select('id').eq('slug', slug).maybeSingle()
    if (existingSlug) {
      let suffix = 2
      while (true) {
        const candidate = `${slug}-${suffix}`
        const { data: collision } = await supabase
          .from('blog_posts').select('id').eq('slug', candidate).maybeSingle()
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

    if (insertErr) throw new Error(`Failed to save blog post: ${insertErr.message}`)

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

    // Link blog post to production
    await supabase
      .from('productions')
      .update({ blog_linked: blogPost.id })
      .eq('id', productionId)

    // Mark queue item as completed
    await supabase
      .from('blog_generation_queue')
      .update({
        status: 'completed',
        blog_post_id: blogPost.id,
        completed_at: new Date().toISOString(),
      })
      .eq('id', item.id)

    return {
      productionId,
      status: 'completed',
      blogPostId: blogPost.id,
      title: blogPost.title,
    }
  } catch (err: any) {
    await supabase
      .from('blog_generation_queue')
      .update({
        status: 'failed',
        error: err.message?.slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq('id', item.id)

    return { productionId, status: 'failed', error: err.message }
  }
}
