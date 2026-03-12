'use server'

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateUserRole(userId: string, role: 'admin' | 'member') {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('user_profiles')
    .update({ role })
    .eq('id', userId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/users/${userId}`)
  revalidatePath('/admin/users')
}

export async function updateMembershipStatus(membershipId: string, status: 'active' | 'expired' | 'cancelled') {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('user_memberships')
    .update({ status })
    .eq('id', membershipId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/users')
}
