import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { UserProfile } from '@/types/database'

export async function getSession() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function requireAuth() {
  const user = await getUser()
  if (!user) {
    redirect('/login')
  }
  return user
}

export async function requireMembership() {
  const supabase = await createClient()
  const user = await requireAuth()

  const { data: membership } = await supabase
    .from('user_memberships')
    .select('id, status, enddate, membership_levels(name)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const hasActive =
    membership &&
    membership.status === 'active' &&
    (!membership.enddate || new Date(membership.enddate) > new Date())

  if (!hasActive) {
    redirect('/membership-account/membership-levels')
  }

  return { user, membership }
}

export async function getUserProfile() {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) return null

  const { data } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return data
}

export async function getAdminUser() {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) return null

  const { data: profileData } = await supabase
    .from('user_profiles')
    .select('id, role, first_name, last_name, display_name')
    .eq('id', user.id)
    .single()

  const profile = profileData as Pick<UserProfile, 'id' | 'role' | 'first_name' | 'last_name' | 'display_name'> | null

  if (profile?.role !== 'admin') return null
  return { user, profile }
}

export async function requireAdmin() {
  const result = await getAdminUser()
  if (!result) {
    redirect('/login?message=Admin+access+required')
  }
  return result
}

export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .single()
  return data?.role === 'admin'
}

export async function isMember(userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('user_memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)

  return (data?.length ?? 0) > 0
}
