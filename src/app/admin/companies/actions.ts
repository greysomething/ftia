'use server'

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { slugify } from '@/lib/utils'

export async function saveCompany(prevState: any, formData: FormData) {
  await requireAdmin()
  const supabase = createAdminClient()

  const id = formData.get('id') ? Number(formData.get('id')) : null
  const title = String(formData.get('title') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim() || slugify(title)
  const visibility = String(formData.get('visibility') ?? 'public')

  const row = {
    title, slug, visibility,
    address: (formData.get('address') as string) || null,
    city: (formData.get('city') as string) || null,
    province: (formData.get('province') as string) || null,
    phone: (formData.get('phone') as string) || null,
    fax: (formData.get('fax') as string) || null,
    email: (formData.get('email') as string) || null,
    website: (formData.get('website') as string) || null,
    linkedin: (formData.get('linkedin') as string) || null,
    twitter: (formData.get('twitter') as string) || null,
    content: (formData.get('content') as string) || null,
  }

  if (!title) return { error: 'Title is required.' }

  if (id) {
    const { error } = await supabase.from('production_contacts').update(row).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('production_contacts').insert(row)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/companies')
  revalidatePath('/production-contact')
  redirect('/admin/companies')
}

export async function deleteCompany(id: number) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('production_contacts').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/companies')
  revalidatePath('/production-contact')
}
