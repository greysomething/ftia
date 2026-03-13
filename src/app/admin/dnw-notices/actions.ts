'use server'

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function saveDnwNotice(prevState: any, formData: FormData) {
  await requireAdmin()
  const supabase = createAdminClient()

  const id = formData.get('id') ? Number(formData.get('id')) : null
  const production_title = String(formData.get('production_title') ?? '').trim()
  const company_name = String(formData.get('company_name') ?? '').trim()

  if (!production_title) return { error: 'Production title is required.' }
  if (!company_name) return { error: 'Company / producer name is required.' }

  const row = {
    production_title,
    company_name,
    reason: String(formData.get('reason') ?? '').trim(),
    details: String(formData.get('details') ?? '').trim(),
    notice_date: String(formData.get('notice_date') ?? new Date().toISOString().slice(0, 10)),
    status: (formData.get('status') as string) || 'active',
  }

  if (id) {
    const { error } = await supabase.from('dnw_notices').update(row).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('dnw_notices').insert(row)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/dnw-notices')
  revalidatePath('/do-not-work')
  redirect('/admin/dnw-notices')
}

export async function deleteDnwNotice(id: number) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('dnw_notices').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/dnw-notices')
  revalidatePath('/do-not-work')
}
