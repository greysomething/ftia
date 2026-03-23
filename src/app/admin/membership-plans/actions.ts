'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function saveMembershipPlan(prevState: any, formData: FormData) {
  const id = formData.get('id') as string | null
  const name = (formData.get('name') as string)?.trim()
  const description = (formData.get('description') as string)?.trim() || null
  const confirmation = (formData.get('confirmation') as string)?.trim() || null
  const initial_payment = parseFloat(formData.get('initial_payment') as string) || 0
  const billing_amount = parseFloat(formData.get('billing_amount') as string) || 0
  const cycle_number = parseInt(formData.get('cycle_number') as string) || 1
  const cycle_period = (formData.get('cycle_period') as string) || 'Month'
  const billing_limit = parseInt(formData.get('billing_limit') as string) || 0
  const trial_amount = parseFloat(formData.get('trial_amount') as string) || 0
  const trial_limit = parseInt(formData.get('trial_limit') as string) || 0
  const allow_signups = formData.get('allow_signups') === 'on'
  const is_active = formData.get('is_active') === 'on'
  const stripe_price_id = (formData.get('stripe_price_id') as string)?.trim() || null

  if (!name) {
    return { error: 'Plan name is required.' }
  }

  const supabase = createAdminClient()

  const record = {
    name,
    description,
    confirmation,
    initial_payment,
    billing_amount,
    cycle_number,
    cycle_period,
    billing_limit,
    trial_amount,
    trial_limit,
    allow_signups,
    is_active,
    stripe_price_id,
  }

  if (id) {
    const { error } = await supabase
      .from('membership_levels')
      .update(record)
      .eq('id', parseInt(id, 10))
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from('membership_levels')
      .insert(record)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/membership-plans')
  revalidatePath('/membership-plans')
  redirect('/admin/membership-plans')
}
