/**
 * Create Supabase Auth accounts for all WordPress users.
 *
 * This script:
 * 1. Reads all WP users from the local MySQL database
 * 2. Creates Supabase Auth accounts with random passwords (users will reset)
 * 3. Links each auth account to its user_profile via user_id
 * 4. Marks email as confirmed so users can immediately request password resets
 *
 * Prerequisites:
 * - user_profiles must be migrated first (run migrate-users.ts)
 * - Local WP site must be running (for MySQL access)
 *
 * After running this script, users can:
 * 1. Go to /login
 * 2. Click "Forgot password?"
 * 3. Enter their email to receive a reset link
 * 4. Set a new password and start using the new site
 *
 * Usage: npx tsx scripts/migration/create-auth-accounts.ts [--dry-run]
 */
import { mysql } from './db'
import { supabase } from './supabase-admin'
import * as crypto from 'crypto'

const DRY_RUN = process.argv.includes('--dry-run')

async function createAuthAccounts() {
  console.log('\n=== CREATE SUPABASE AUTH ACCOUNTS ===')
  if (DRY_RUN) console.log('  [DRY RUN — no changes will be made]\n')

  // 1. Fetch all WP users
  const wpUsers = mysql(`
    SELECT u.ID, u.user_email, u.user_registered, u.display_name
    FROM wp_users u
    WHERE u.user_email != ''
    ORDER BY u.ID ASC
  `)

  console.log(`  Found ${wpUsers.length} WordPress users`)

  // 2. Fetch existing Supabase auth users to skip duplicates
  const existingEmails = new Set<string>()
  let page = 1
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) { console.error('  Error fetching auth users:', error); break }
    if (!data?.users?.length) break
    for (const u of data.users) {
      if (u.email) existingEmails.add(u.email.toLowerCase())
    }
    if (data.users.length < 1000) break
    page++
  }

  console.log(`  ${existingEmails.size} auth accounts already exist`)

  // 3. Filter to users that need accounts
  const newUsers = wpUsers.filter(
    (u: any) => !existingEmails.has(u.user_email?.toLowerCase())
  )

  console.log(`  ${newUsers.length} new auth accounts to create\n`)

  if (newUsers.length === 0) {
    console.log('  Nothing to do — all users already have auth accounts.')
    return
  }

  // 4. Fetch user meta for names
  const wpIds = newUsers.map((u: any) => u.ID).join(',')
  const userMeta = mysql(`
    SELECT user_id, meta_key, meta_value
    FROM wp_usermeta
    WHERE user_id IN (${wpIds})
      AND meta_key IN ('first_name', 'last_name')
  `)

  const metaByUser: Record<string, Record<string, string>> = {}
  for (const m of userMeta) {
    if (!metaByUser[m.user_id]) metaByUser[m.user_id] = {}
    metaByUser[m.user_id][m.meta_key] = m.meta_value
  }

  // 5. Create auth accounts one at a time (Supabase admin API)
  let created = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < newUsers.length; i++) {
    const u = newUsers[i]
    const email = u.user_email?.toLowerCase().trim()
    if (!email) { skipped++; continue }

    const meta = metaByUser[u.ID] ?? {}
    const firstName = meta.first_name || u.display_name?.split(' ')[0] || ''
    const lastName = meta.last_name || u.display_name?.split(' ').slice(1).join(' ') || ''

    // Random 32-char password — user will never know this; they'll reset
    const tempPassword = crypto.randomBytes(24).toString('base64url')

    if (DRY_RUN) {
      process.stdout.write(`  [DRY] Would create: ${email}\r`)
      created++
      continue
    }

    const { data: authUser, error } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // Mark email as confirmed so they can reset password
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        wp_user_id: parseInt(u.ID, 10),
      },
    })

    if (error) {
      if (error.message?.includes('already been registered')) {
        skipped++
      } else {
        console.error(`\n  Error creating ${email}:`, error.message)
        errors++
      }
      continue
    }

    // 6. Link the auth account to the user_profile
    if (authUser?.user?.id) {
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({ id: authUser.user.id })
        .eq('wp_user_id', parseInt(u.ID, 10))

      if (profileError) {
        // Profile might not exist yet or might already be linked
        // Try upsert with email match as fallback
        await supabase
          .from('user_profiles')
          .update({ id: authUser.user.id })
          .eq('email', email)
      }
    }

    created++
    process.stdout.write(`  Creating accounts: ${created + skipped + errors}/${newUsers.length} (${created} created, ${skipped} skipped, ${errors} errors)\r`)

    // Rate limit: Supabase admin API has limits
    if (i > 0 && i % 30 === 0) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  console.log(`\n\n  Results:`)
  console.log(`    Created: ${created}`)
  console.log(`    Skipped: ${skipped} (already existed)`)
  console.log(`    Errors:  ${errors}`)
  console.log(`\n✓ Auth account creation complete.`)
  console.log(`  Users can now go to /forgot-password to set their password.`)
}

createAuthAccounts().catch((e) => {
  console.error(e)
  process.exit(1)
})
