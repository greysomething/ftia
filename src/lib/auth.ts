import { createClient, createAdminClient, createRawClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { UserProfile } from '@/types/database'

// ── Impersonation helpers ────────────────────────────────────────────

interface ImpersonationInfo {
  targetId: string
  targetEmail: string
  targetName: string
  adminId: string
  adminName: string
}

/**
 * Read the impersonation cookie (if any).
 * Returns null if not impersonating.
 */
async function getImpersonation(): Promise<ImpersonationInfo | null> {
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  const raw = cookieStore.get('impersonate_uid')?.value
  if (!raw) return null
  try {
    return JSON.parse(raw) as ImpersonationInfo
  } catch {
    return null
  }
}

/**
 * Returns the real logged-in user, ignoring any impersonation.
 * Always uses the actual session cookies (not the impersonation-aware client).
 */
async function getRealUser() {
  const supabase = await createRawClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// ── Core auth functions (impersonation-aware) ────────────────────────

export async function getSession() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

/**
 * Returns the current effective user.
 * During impersonation, returns the impersonated user (fetched via admin client).
 */
export async function getUser() {
  const imp = await getImpersonation()

  if (imp) {
    // Verify the real user is still an admin (security check)
    const realUser = await getRealUser()
    if (!realUser) return null

    const adminClient = createAdminClient()
    const { data: realProfile } = await adminClient
      .from('user_profiles')
      .select('role')
      .eq('id', realUser.id)
      .single()

    if (realProfile?.role !== 'admin') return null

    // Return the impersonated user
    const { data: { user: targetUser } } = await adminClient.auth.admin.getUserById(imp.targetId)
    return targetUser ?? null
  }

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
  const user = await requireAuth()
  const imp = await getImpersonation()

  // Use admin client during impersonation to bypass RLS
  const client = imp ? createAdminClient() : await createClient()

  const { data: membership } = await client
    .from('user_memberships')
    .select('id, status, enddate, membership_levels(name)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const m = membership as { id: number; status: string; enddate: string | null } | null
  const hasActive =
    m &&
    m.status === 'active' &&
    (!m.enddate || new Date(m.enddate) > new Date())

  if (!hasActive) {
    redirect('/membership-plans')
  }

  return { user, membership }
}

/**
 * Returns the effective user's profile.
 * During impersonation, returns the impersonated user's profile.
 */
export async function getUserProfile() {
  const user = await getUser()
  if (!user) return null

  const imp = await getImpersonation()
  const client = imp ? createAdminClient() : await createClient()

  const { data } = await client
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return data
}

/**
 * Returns admin user info ONLY if the real user is an admin
 * AND we are NOT currently impersonating.
 * This ensures admin pages are inaccessible during impersonation.
 */
export async function getAdminUser() {
  // If impersonating, admin functions should not work
  // (so admin pages redirect away, showing user-facing pages instead)
  const imp = await getImpersonation()
  if (imp) return null

  // Use raw client to check the real session (not impersonation-aware)
  const supabase = await createRawClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Use admin client to read profile (bypasses RLS)
  const adminClient = createAdminClient()
  const { data: profileData } = await adminClient
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
  // Use admin client to bypass RLS (works regardless of who is calling)
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .single()
  return (data as { role: string } | null)?.role === 'admin'
}

export async function isMember(userId: string): Promise<boolean> {
  const imp = await getImpersonation()

  // During impersonation, check the impersonated user's actual membership
  if (imp) {
    const adminClient = createAdminClient()
    const { data } = await adminClient
      .from('user_memberships')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)

    return (data?.length ?? 0) > 0
  }

  const supabase = await createClient()

  // Admins automatically have member access unless viewing as visitor
  const { data: profileData } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .single()

  const profile = profileData as { role: string } | null

  if (profile?.role === 'admin') {
    // Check for "view as visitor" override cookie
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    if (cookieStore.get('admin_view_as')?.value === 'visitor') {
      return false
    }
    return true
  }

  // Regular membership check (active, trialing, past_due all have access)
  const { data } = await supabase
    .from('user_memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)

  return (data?.length ?? 0) > 0
}
