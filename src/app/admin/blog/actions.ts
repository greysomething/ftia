'use server'

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { slugify } from '@/lib/utils'

export async function saveBlogPost(prevState: any, formData: FormData) {
  await requireAdmin()
  const supabase = createAdminClient()

  const id = formData.get('id') ? Number(formData.get('id')) : null
  const title = String(formData.get('title') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim() || slugify(title)
  const visibility = String(formData.get('visibility') ?? 'draft')

  if (!title) return { error: 'Title is required.' }

  const row: Record<string, any> = {
    title, slug, visibility,
    content: (formData.get('content') as string) || null,
    excerpt: (formData.get('excerpt') as string) || null,
  }

  // Set published_at when publishing for the first time
  if (visibility === 'publish') {
    if (id) {
      // Only set published_at if it wasn't already set
      const { data: existing } = await supabase
        .from('blog_posts')
        .select('published_at')
        .eq('id', id)
        .single()
      if (!existing?.published_at) {
        row.published_at = new Date().toISOString()
      }
    } else {
      row.published_at = new Date().toISOString()
    }
  }

  if (id) {
    const { error } = await supabase.from('blog_posts').update(row).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('blog_posts').insert(row)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/blog')
  revalidatePath('/blog')
  redirect('/admin/blog')
}

export async function deleteBlogPost(id: number) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('blog_posts').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/blog')
  revalidatePath('/blog')
}
