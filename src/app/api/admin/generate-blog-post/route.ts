import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BLOG_PROMPT = `You are a senior entertainment industry journalist writing for ProductionList.com — the Film & Television Industry Alliance's (FTIA) daily-updated directory of active film and television productions across North America. Your readers are working professionals (line producers, department heads, crew members, location managers, casting directors) and aspiring filmmakers actively seeking their next project.

Write a production report–style blog article announcing this project. Requirements:

TITLE:
- SEO-friendly, descriptive, and action-oriented (e.g. "New ABC Drama From [Showrunner] Sets Up Production in Atlanta" or "[Title]: [Studio] Greenlights Feature Film Starring [Lead]")
- Should clearly communicate the project and appeal to on-set professionals searching for upcoming work

TONE & STYLE:
- Clear, warm, and industry-savvy — not overly promotional, not dry trade press
- Write as a well-connected insider who genuinely wants to help professionals find work
- Conversational but informative — like a trusted colleague sharing a lead
- No paragraph headings, no bullet points, no source citations — continuous flowing prose
- Should feel like a production report, not a news recap

CONTENT (minimum 500 words):
- Open with the announcement: what the project is, who's behind it, and why it matters to working professionals
- Development status and where it sits in the production pipeline (development, pre-production, production)
- Key creative team: showrunner, director, producers, writers — mention their notable previous credits naturally
- Production companies and studios involved, including any co-production deals
- Confirmed or likely filming locations — this is critical for crew looking for local work
- Any known timelines: when production is expected to begin, casting windows, projected wrap dates
- Genre, format (series/limited/feature), network or platform, episode count if known
- If a series: season number, any renewal context
- Weave in details that matter to crew: union status if known, scale of production, number of shooting days, studio vs. location work
- Close by reinforcing that ProductionList.com members get real-time access to full production contacts, crew lists, and scheduling updates — naturally, not as a hard sell. Suggest readers check the full listing on ProductionList.com for contact details and updates.

IMPORTANT:
- Only include factual information from the provided production data and your knowledge. Do not fabricate credits, dates, or details.
- If you're uncertain about a detail, frame it naturally ("reportedly," "is expected to," "sources indicate")
- Do not include markdown formatting, headings, or bullet points — just flowing paragraphs
- Do not include a byline or date — the CMS handles that
- Return your response as JSON: { "title": "...", "content": "...", "excerpt": "..." }
  - title: the SEO-friendly headline
  - content: the full article as HTML paragraphs (wrap each paragraph in <p> tags)
  - excerpt: a 1-2 sentence summary for listings and meta descriptions`

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.SCANNER_ANTHROPIC_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI API key not configured (SCANNER_ANTHROPIC_KEY)' }, { status: 500 })
  }

  const { productionData, productionId } = await req.json() as {
    productionData: {
      title: string
      content?: string
      excerpt?: string
      computed_status?: string
      production_date_start?: string
      production_date_end?: string
      types?: string[]
      statuses?: string[]
      locations?: { location: string; city: string; stage: string; country: string }[]
      crew?: { role_name: string; inline_name: string }[]
      companies?: { inline_name: string }[]
    }
    productionId?: number
  }

  if (!productionData?.title) {
    return NextResponse.json({ error: 'Production title is required' }, { status: 400 })
  }

  // Build context from production data
  const context: string[] = [`Project Title: ${productionData.title}`]

  if (productionData.types?.length) context.push(`Type: ${productionData.types.join(', ')}`)
  if (productionData.statuses?.length) context.push(`Status: ${productionData.statuses.join(', ')}`)
  if (productionData.computed_status) context.push(`Phase: ${productionData.computed_status}`)
  if (productionData.production_date_start) context.push(`Production Start: ${productionData.production_date_start}`)
  if (productionData.production_date_end) context.push(`Production End: ${productionData.production_date_end}`)
  if (productionData.excerpt) context.push(`Logline: ${productionData.excerpt}`)
  if (productionData.content) context.push(`Description: ${productionData.content}`)

  if (productionData.crew?.length) {
    context.push(`Key Crew:\n${productionData.crew.map(c => `  - ${c.role_name}: ${c.inline_name}`).join('\n')}`)
  }
  if (productionData.companies?.length) {
    context.push(`Production Companies: ${productionData.companies.map(c => c.inline_name).join(', ')}`)
  }
  if (productionData.locations?.length) {
    context.push(`Filming Locations:\n${productionData.locations.map(l => `  - ${[l.location, l.city, l.stage, l.country].filter(Boolean).join(', ')}`).join('\n')}`)
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: `${BLOG_PROMPT}\n\nHere is the production data to write about:\n\n${context.join('\n')}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      let friendlyMessage = `AI API returned status ${response.status}`
      try {
        const errJson = JSON.parse(errText)
        const msg = errJson?.error?.message || errJson?.message || ''
        if (msg.toLowerCase().includes('credit') || msg.toLowerCase().includes('balance')) {
          friendlyMessage = 'The Anthropic API credit balance is too low. Please add credits at console.anthropic.com.'
        } else if (msg.toLowerCase().includes('rate limit')) {
          friendlyMessage = 'AI API rate limit reached. Please wait a few minutes and try again.'
        } else if (msg.toLowerCase().includes('overloaded')) {
          friendlyMessage = 'The AI service is temporarily overloaded. Please try again in a moment.'
        } else if (msg) {
          friendlyMessage = msg
        }
      } catch {}
      return NextResponse.json({ error: friendlyMessage }, { status: 500 })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text ?? ''

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AI did not return valid JSON' }, { status: 500 })
    }

    const blogData = JSON.parse(jsonMatch[0])

    // Wrap the first paragraph in an H4 heading
    if (blogData.content) {
      blogData.content = blogData.content.replace(/^<p>([\s\S]*?)<\/p>/, '<h5>$1</h5>')
    }

    // Append CTA linking to the production page
    if (productionId) {
      const supabaseForSlug = createAdminClient()
      const { data: prod } = await supabaseForSlug
        .from('productions')
        .select('slug')
        .eq('id', productionId)
        .single()
      if (prod?.slug) {
        const ctaHtml = `<p style="text-align:center"><strong><a href="/production/${prod.slug}">Click here</a> for production info or to contact producers</strong></p>`
        blogData.content = (blogData.content || '') + '\n' + ctaHtml
      }
    }

    // Save as draft blog post immediately
    const supabase = createAdminClient()
    let slug = slugify(blogData.title || productionData.title)

    // Ensure slug is unique
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

    const { data: blogPost, error: insertErr } = await supabase
      .from('blog_posts')
      .insert({
        title: blogData.title || productionData.title,
        slug,
        content: blogData.content || '',
        excerpt: blogData.excerpt || '',
        visibility: 'draft',
      })
      .select('id, slug')
      .single()

    if (insertErr) {
      // Return the content even if save fails — admin can copy/paste
      return NextResponse.json({
        ok: true,
        saved: false,
        error: insertErr.message,
        blog: blogData,
      })
    }

    // Assign "Project Alerts" category by default
    if (blogPost) {
      const { data: projectAlertsCat } = await supabase
        .from('blog_categories')
        .select('id')
        .eq('slug', 'project-alerts')
        .single()
      if (projectAlertsCat) {
        await supabase.from('blog_post_categories')
          .upsert({ post_id: blogPost.id, category_id: projectAlertsCat.id }, { onConflict: 'post_id,category_id', ignoreDuplicates: true })
      }
    }

    // Link blog post to production if we have a production ID
    if (productionId && blogPost) {
      await supabase
        .from('productions')
        .update({ blog_linked: blogPost.id })
        .eq('id', productionId)
    }

    return NextResponse.json({
      ok: true,
      saved: true,
      blogPostId: blogPost?.id,
      blogSlug: blogPost?.slug,
      blog: blogData,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Blog generation failed' }, { status: 500 })
  }
}
