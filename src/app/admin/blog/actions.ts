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
  let slug = String(formData.get('slug') ?? '').trim() || slugify(title)
  const visibility = String(formData.get('visibility') ?? 'draft')

  if (!title) return { error: 'Title is required.' }

  // Ensure slug is unique (append -2, -3, etc. if collision)
  if (!id) {
    const { data: existingSlug } = await supabase
      .from('blog_posts')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (existingSlug) {
      let suffix = 2
      while (true) {
        const candidate = `${slug}-${suffix}`
        const { data: collision } = await supabase
          .from('blog_posts')
          .select('id')
          .eq('slug', candidate)
          .maybeSingle()
        if (!collision) { slug = candidate; break }
        suffix++
        if (suffix > 20) { slug = `${slug}-${Date.now()}`; break }
      }
    }
  }

  const row: Record<string, any> = {
    title, slug, visibility,
    content: (formData.get('content') as string) || null,
    excerpt: (formData.get('excerpt') as string) || null,
    featured_image_url: (formData.get('featured_image_url') as string) || null,
  }

  // Handle published_at / scheduling
  const scheduledAt = (formData.get('scheduled_at') as string) || null

  if (visibility === 'publish' && scheduledAt) {
    // Scheduling for a future date
    row.published_at = new Date(scheduledAt).toISOString()
  } else if (visibility === 'publish') {
    if (id) {
      // Only set published_at if it wasn't already set (or was a future date being published now)
      const { data: existing } = await supabase
        .from('blog_posts')
        .select('published_at')
        .eq('id', id)
        .single()
      if (!existing?.published_at || new Date(existing.published_at) > new Date()) {
        row.published_at = new Date().toISOString()
      }
    } else {
      row.published_at = new Date().toISOString()
    }
  } else if (visibility === 'draft') {
    // Drafts clear the published_at
    row.published_at = null
  }

  let postId = id
  if (id) {
    const { error } = await supabase.from('blog_posts').update(row).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { data: inserted, error } = await supabase.from('blog_posts').insert(row).select('id').single()
    if (error) return { error: error.message }
    postId = inserted.id
  }

  // Save categories
  const categoryIdsRaw = formData.get('category_ids') as string
  if (categoryIdsRaw && postId) {
    const categoryIds: number[] = JSON.parse(categoryIdsRaw)
    // Clear existing and re-insert
    await supabase.from('blog_post_categories').delete().eq('post_id', postId)
    if (categoryIds.length > 0) {
      await supabase.from('blog_post_categories').insert(
        categoryIds.map(cid => ({ post_id: postId!, category_id: cid }))
      )
    }
  }

  revalidatePath('/admin/blog')
  revalidatePath('/blog')
  if (id) {
    revalidatePath(`/admin/blog/${id}/edit`)
    redirect(`/admin/blog/${id}/edit`)
  } else {
    redirect(`/admin/blog/${postId}/edit`)
  }
}

export async function trashBlogPost(id: number) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('blog_posts')
    .update({ visibility: 'private' as any })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/blog')
  revalidatePath('/blog')
}

export async function restoreBlogPost(id: number) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('blog_posts')
    .update({ visibility: 'draft' as any })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/blog')
}

export async function deleteBlogPost(id: number) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('blog_posts').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/blog')
  revalidatePath('/blog')
}

export async function bulkBlogAction(ids: number[], action: string, value?: string) {
  await requireAdmin()
  const supabase = createAdminClient()

  if (action === 'trash') {
    const { error } = await supabase.from('blog_posts')
      .update({ visibility: 'private' as any })
      .in('id', ids)
    if (error) throw new Error(error.message)
  } else if (action === 'restore') {
    const { error } = await supabase.from('blog_posts')
      .update({ visibility: 'draft' as any })
      .in('id', ids)
    if (error) throw new Error(error.message)
  } else if (action === 'publish') {
    const { error } = await supabase.from('blog_posts')
      .update({ visibility: 'publish' as any, published_at: new Date().toISOString() })
      .in('id', ids)
    if (error) throw new Error(error.message)
  } else if (action === 'draft') {
    const { error } = await supabase.from('blog_posts')
      .update({ visibility: 'draft' as any, published_at: null })
      .in('id', ids)
    if (error) throw new Error(error.message)
  } else if (action === 'set-category' && value) {
    const categoryId = parseInt(value, 10)
    for (const postId of ids) {
      // Upsert: add category if not already linked
      await supabase.from('blog_post_categories')
        .upsert({ post_id: postId, category_id: categoryId }, { onConflict: 'post_id,category_id', ignoreDuplicates: true })
    }
  } else if (action === 'remove-category' && value) {
    const categoryId = parseInt(value, 10)
    await supabase.from('blog_post_categories')
      .delete()
      .in('post_id', ids)
      .eq('category_id', categoryId)
  } else if (action === 'delete') {
    const { error } = await supabase.from('blog_posts')
      .delete()
      .in('id', ids)
    if (error) throw new Error(error.message)
  }

  revalidatePath('/admin/blog')
  revalidatePath('/blog')
}
