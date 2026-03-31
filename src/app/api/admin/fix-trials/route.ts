import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/fix-trials — Database-only fix
 *
 * Updates user_memberships rows that have status='trialing' to status='active'
 * when the membership level has trial_limit=0 (meaning that plan shouldn't have
 * a trial). These users already paid — the trial flag was set erroneously.
 *
 * This does NOT touch Stripe at all. The trial will naturally expire in Stripe
 * and the next billing cycle will proceed normally.
 */
export async function POST() {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Find all memberships marked as 'trialing' where the level has no trial configured
  const { data: trialingMemberships, error: fetchError } = await supabase
    .from('user_memberships')
    .select(`
      id,
      user_id,
      status,
      stripe_subscription_id,
      level_id,
      billing_email,
      membership_levels(name, trial_limit)
    `)
    .eq('status', 'trialing')

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const results: any[] = []
  let fixed = 0
  let skipped = 0

  for (const mem of trialingMemberships ?? []) {
    const level = mem.membership_levels as any
    const trialLimit = level?.trial_limit ?? 0

    if (trialLimit > 0) {
      // This is a legitimate trial plan — leave it alone
      skipped++
      results.push({
        id: mem.id,
        email: mem.billing_email,
        planName: level?.name ?? 'Unknown',
        action: 'skipped — legitimate trial plan',
      })
      continue
    }

    // This membership shouldn't be trialing — update to active (database only)
    const { error: updateError } = await supabase
      .from('user_memberships')
      .update({ status: 'active', modified: new Date().toISOString() })
      .eq('id', mem.id)

    if (updateError) {
      results.push({
        id: mem.id,
        email: mem.billing_email,
        planName: level?.name ?? 'Unknown',
        action: 'error',
        error: updateError.message,
      })
    } else {
      fixed++
      results.push({
        id: mem.id,
        email: mem.billing_email,
        planName: level?.name ?? 'Unknown',
        action: 'updated to active',
      })
    }
  }

  return NextResponse.json({
    message: `Fixed ${fixed} incorrect trials. ${skipped} legitimate trials left unchanged.`,
    totalTrialing: (trialingMemberships ?? []).length,
    fixed,
    skipped,
    results,
  })
}
