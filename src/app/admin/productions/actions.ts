'use server'

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { slugify } from '@/lib/utils'

export async function saveProduction(prevState: any, formData: FormData) {
  await requireAdmin()
  const supabase = createAdminClient()

  const id = formData.get('id') ? Number(formData.get('id')) : null
  const title = String(formData.get('title') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim() || slugify(title)
  const visibility = String(formData.get('visibility') ?? 'publish')
  const content = String(formData.get('content') ?? '') || null
  const production_date_start = (formData.get('production_date_start') as string) || null
  const production_date_end = (formData.get('production_date_end') as string) || null

  if (!title) return { error: 'Title is required.' }

  const row = { title, slug, visibility, content, production_date_start, production_date_end }

  if (id) {
    const { error } = await supabase.from('productions').update(row).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('productions').insert(row)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/productions')
  revalidatePath('/productions')
  redirect('/admin/productions')
}

export async function deleteProduction(id: number) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('productions').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/productions')
  revalidatePath('/productions')
}
