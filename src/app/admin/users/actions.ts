'use server'

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/activity-log'
import { moveToActiveMember, moveToPastMember } from '@/lib/resend-audiences'

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

export async function updateMembershipStatus(
  membershipId: string,
  status: 'active' | 'expired' | 'cancelled',
  userId?: string
) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('user_memberships')
    .update({ status, modified: new Date().toISOString() })
    .eq('id', membershipId)
  if (error) throw new Error(error.message)

  // Update Resend audience (fire-and-forget)
  if (userId) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('email, first_name, last_name')
      .eq('id', userId)
      .single()
    if (profile?.email) {
      if (status === 'active') {
        void moveToActiveMember(profile.email, profile.first_name ?? undefined, profile.last_name ?? undefined)
      } else if (status === 'expired' || status === 'cancelled') {
        void moveToPastMember(profile.email, profile.first_name ?? undefined, profile.last_name ?? undefined)
      }
    }
  }

  if (userId) revalidatePath(`/admin/users/${userId}`)
  revalidatePath('/admin/users')
}

export async function assignMembership(formData: FormData) {
  await requireAdmin()
  const supabase = createAdminClient()

  const userId = formData.get('userId') as string
  const levelId = parseInt(formData.get('levelId') as string, 10)
  const duration = formData.get('duration') as string

  if (!userId || !levelId) throw new Error('Missing userId or levelId')

  // Calculate end date based on duration
  const now = new Date()
  let endDate: string | null = null

  switch (duration) {
    case '1m':
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString()
      break
    case '3m':
      endDate = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate()).toISOString()
      break
    case '6m':
      endDate = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()).toISOString()
      break
    case '1y':
      endDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString()
      break
    case 'lifetime':
      endDate = null // No expiration
      break
    default:
      endDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString()
  }

  const { error } = await supabase
    .from('user_memberships')
    .insert({
      user_id: userId,
      level_id: levelId,
      status: 'active',
      startdate: now.toISOString(),
      enddate: endDate,
      modified: now.toISOString(),
      // No stripe fields — this is a manual assignment
    })

  if (error) throw new Error(error.message)

  // Add to Active Members audience (fire-and-forget)
  {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('email, first_name, last_name')
      .eq('id', userId)
      .single()
    if (profile?.email) {
      void moveToActiveMember(profile.email, profile.first_name ?? undefined, profile.last_name ?? undefined)
    }
  }

  revalidatePath(`/admin/users/${userId}`)
  revalidatePath('/admin/users')
}

export async function updateProfile(formData: FormData) {
  await requireAdmin()
  const supabase = createAdminClient()

  const userId = formData.get('userId') as string
  if (!userId) throw new Error('Missing userId')

  const updates: Record<string, string | null> = {
    first_name: (formData.get('firstName') as string) || null,
    last_name: (formData.get('lastName') as string) || null,
    display_name: (formData.get('displayName') as string) || null,
    organization_name: (formData.get('organizationName') as string) || null,
    organization_type: (formData.get('organizationType') as string) || null,
    country: (formData.get('country') as string) || null,
    linkedin: (formData.get('linkedin') as string) || null,
    description: (formData.get('description') as string) || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('id', userId)

  if (error) throw new Error(error.message)

  // Log admin profile update (fire-and-forget)
  logActivity({
    userId,
    eventType: 'profile_update',
    metadata: { updatedBy: 'admin', fields: Object.keys(updates).filter(k => k !== 'updated_at') },
  })

  revalidatePath(`/admin/users/${userId}`)
  revalidatePath('/admin/users')
}
