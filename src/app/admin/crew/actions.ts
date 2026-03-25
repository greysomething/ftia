'use server'

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { slugify } from '@/lib/utils'

export async function saveCrew(prevState: any, formData: FormData) {
  await requireAdmin()
  const supabase = createAdminClient()

  const id = formData.get('id') ? Number(formData.get('id')) : null
  const name = String(formData.get('name') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim() || slugify(name)
  const visibility = String(formData.get('visibility') ?? 'publish')

  const emailVal = (formData.get('email') as string)?.trim() || null
  const phoneVal = (formData.get('phone') as string)?.trim() || null
  const websiteVal = (formData.get('website') as string)?.trim() || null
  const contentVal = (formData.get('content') as string)?.trim() || null
  const imdbVal = (formData.get('imdb') as string)?.trim() || null
  const instagramVal = (formData.get('instagram') as string)?.trim() || null
  const locationVal = (formData.get('location') as string)?.trim() || null

  // Parse JSON arrays from hidden fields
  let roles: string[] = []
  let knownFor: string[] = []
  try { roles = JSON.parse(formData.get('roles') as string ?? '[]') } catch {}
  try { knownFor = JSON.parse(formData.get('known_for') as string ?? '[]') } catch {}

  // Build representation object from individual fields
  const repAgency = (formData.get('rep_agency') as string)?.trim() || null
  const repAgent = (formData.get('rep_agent') as string)?.trim() || null
  const repManager = (formData.get('rep_manager') as string)?.trim() || null
  const representation = (repAgency || repAgent || repManager)
    ? { agency: repAgency, agent: repAgent, manager: repManager }
    : {}

  const row = {
    name, slug, visibility,
    emails: emailVal ? [emailVal] : [],
    phones: phoneVal ? [phoneVal] : [],
    linkedin: (formData.get('linkedin') as string)?.trim() || null,
    twitter: (formData.get('twitter') as string)?.trim() || null,
    instagram: instagramVal,
    website: websiteVal,
    content: contentVal,
    imdb: imdbVal,
    location: locationVal,
    roles,
    known_for: knownFor,
    representation,
  }

  if (!name) return { error: 'Name is required.' }

  if (id) {
    const { error } = await supabase.from('crew_members').update(row).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('crew_members').insert(row)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/crew')
  revalidatePath('/production-role')
  redirect('/admin/crew')
}

export async function deleteCrew(id: number) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('crew_members').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/crew')
  revalidatePath('/production-role')
}
