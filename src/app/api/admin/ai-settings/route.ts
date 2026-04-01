import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { DEFAULT_PROMPTS } from '@/lib/ai-prompts'

export async function GET() {
  await requireAdmin()
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('ai_research_prompts')
    .select('*')
    .order('slug')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Include defaults so the client page doesn't need to import the prompts lib
  return NextResponse.json({ rows: data, defaults: DEFAULT_PROMPTS })
}

export async function PUT(request: Request) {
  await requireAdmin()
  const supabase = createAdminClient()

  const body = await request.json()
  const { slug, system_prompt, model, max_tokens } = body

  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('ai_research_prompts')
    .upsert(
      {
        slug,
        name: body.name || slug,
        system_prompt: system_prompt || null,
        model: model || null,
        max_tokens: max_tokens ? Number(max_tokens) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'slug' }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
