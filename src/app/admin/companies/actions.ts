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
  const visibility = String(formData.get('visibility') ?? 'publish')

  const addressVal = (formData.get('address') as string)?.trim() || null
  const phoneVal = (formData.get('phone') as string)?.trim() || null
  const faxVal = (formData.get('fax') as string)?.trim() || null
  const emailVal = (formData.get('email') as string)?.trim() || null

  const row = {
    title, slug, visibility,
    addresses: addressVal ? [addressVal] : [],
    phones: phoneVal ? [phoneVal] : [],
    faxes: faxVal ? [faxVal] : [],
    emails: emailVal ? [emailVal] : [],
    linkedin: (formData.get('linkedin') as string) || null,
    twitter: (formData.get('twitter') as string) || null,
    content: (formData.get('content') as string) || null,
  }

  if (!title) return { error: 'Title is required.' }

  if (id) {
    const { error } = await supabase.from('companies').update(row).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('companies').insert(row)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/companies')
  revalidatePath('/production-contact')
  redirect('/admin/companies')
}

export async function deleteCompany(id: number) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('companies').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/companies')
  revalidatePath('/production-contact')
}
