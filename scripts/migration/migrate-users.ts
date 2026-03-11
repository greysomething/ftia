/**
 * Migrate WordPress users → Supabase user_profiles table.
 *
 * NOTE: This script creates user_profile records only.
 * It does NOT create Supabase Auth users — users must sign up themselves
 * or be invited via Supabase Auth Admin API with password reset emails.
 *
 * The profile records are keyed by email so they can be linked
 * once users register with the same email.
 */
import { mysql } from './db'
import { supabase, batchUpsert } from './supabase-admin'

export async function runUsersMigration() {
  console.log('\n=== USERS MIGRATION ===')
  console.log('  NOTE: Creating profile stubs only. Auth accounts not created.')

  const users = mysql(`
    SELECT u.ID, u.user_email, u.user_registered, u.display_name
    FROM wp_users u
    ORDER BY u.ID ASC
  `)

  console.log(`  Found ${users.length} users`)

  // Fetch relevant user meta
  const userMeta = mysql(`
    SELECT user_id, meta_key, meta_value
    FROM wp_usermeta
    WHERE meta_key IN (
      'first_name', 'last_name', 'billing_phone',
      'pmpro_stripe_customerid',
      'bfirstname', 'blastname', 'baddress1', 'baddress2',
      'bcity', 'bstate', 'bzipcode', 'bcountry', 'bphone', 'bemail',
      'country', 'stage', 'custommer_job', 'about_production',
      'organization_name', 'organization_type',
      'facebook', 'twitter', 'googleplus'
    )
    ORDER BY user_id, meta_key
  `)

  const metaByUser: Record<string, Record<string, string>> = {}
  for (const m of userMeta) {
    if (!metaByUser[m.user_id]) metaByUser[m.user_id] = {}
    metaByUser[m.user_id][m.meta_key] = m.meta_value
  }

  // We need to look up existing Supabase auth users by email to link profiles
  // Batch look up via admin API (25 at a time due to API limits)
  const emailToSupabaseId: Record<string, string> = {}

  for (let i = 0; i < users.length; i += 50) {
    const batch = users.slice(i, i + 50)
    for (const u of batch) {
      const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (data?.users) {
        for (const su of data.users) {
          if (su.email) emailToSupabaseId[su.email.toLowerCase()] = su.id
        }
      }
      break // Only need to fetch once
    }
  }

  // Build profile rows
  const profileRows: any[] = []

  for (const u of users) {
    const meta = metaByUser[u.ID] ?? {}
    const email = u.user_email?.toLowerCase()
    const supabaseId = emailToSupabaseId[email]

    const firstName = meta.first_name || meta.bfirstname || u.display_name?.split(' ')[0] || null
    const lastName = meta.last_name || meta.blastname || u.display_name?.split(' ').slice(1).join(' ') || null

    profileRows.push({
      // If we have a supabase auth ID, link it; otherwise use a placeholder
      id: supabaseId ?? null,
      wp_user_id: parseInt(u.ID, 10),
      email: email,
      first_name: firstName,
      last_name: lastName,
      organization_name: meta.organization_name || null,
      organization_type: meta.organization_type || null,
      country: meta.country || meta.bcountry || null,
      phone: meta.bphone || meta.billing_phone || null,
      job_title: meta.custommer_job || meta.stage || null,
      about: meta.about_production || null,
      facebook: meta.facebook || null,
      twitter: meta.twitter || null,
      linkedin: null,
      stripe_customer_id: meta.pmpro_stripe_customerid || null,
      billing_address1: meta.baddress1 || null,
      billing_address2: meta.baddress2 || null,
      billing_city: meta.bcity || null,
      billing_state: meta.bstate || null,
      billing_zip: meta.bzipcode || null,
      billing_country: meta.bcountry || null,
      created_at: u.user_registered ? new Date(u.user_registered).toISOString() : null,
    })
  }

  // Only insert profiles where we have a supabase ID
  const linkedProfiles = profileRows.filter((p) => p.id)
  const unlinkedProfiles = profileRows.filter((p) => !p.id)

  console.log(`  ${linkedProfiles.length} users matched to Supabase auth accounts`)
  console.log(`  ${unlinkedProfiles.length} users not yet in Supabase auth (will need to register)`)

  if (linkedProfiles.length > 0) {
    await batchUpsert('user_profiles', linkedProfiles, 100, 'id')
  }

  // Store unlinked profiles with wp_user_id for later matching
  // These will be updated by the handle_new_user trigger when users register
  console.log('\n✓ Users migration complete.')
  console.log('  Run migrate-memberships.ts next to migrate subscription data.')
}

if (require.main === module) {
  runUsersMigration().catch((e) => { console.error(e); process.exit(1) })
}
