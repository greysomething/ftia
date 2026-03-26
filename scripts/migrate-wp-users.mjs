#!/usr/bin/env node
/**
 * Migrate WordPress users to Supabase
 *
 * Reads from local WordPress MySQL database and:
 * 1. Matches existing Supabase users by email
 * 2. Creates Supabase auth accounts for new WP users
 * 3. Enriches user_profiles with WP data (names, registration, etc.)
 * 4. Syncs memberships from WP PMPro data
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env.local') })

import { createClient } from '@supabase/supabase-js'
import mysql from 'mysql2/promise'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// MySQL connection via Local by Flywheel socket
const MYSQL_SOCK = '/Users/greysomething/Library/Application Support/Local/run/2W0rfPpDJ/mysql/mysqld.sock'

async function getWpUsers(conn) {
  const [rows] = await conn.query(`
    SELECT
      u.ID as wp_id,
      u.user_login,
      u.user_email,
      u.display_name,
      u.user_registered,
      u.user_url,
      MAX(CASE WHEN m.meta_key = 'first_name' THEN m.meta_value END) as first_name,
      MAX(CASE WHEN m.meta_key = 'last_name' THEN m.meta_value END) as last_name,
      MAX(CASE WHEN m.meta_key = 'nickname' THEN m.meta_value END) as nickname,
      MAX(CASE WHEN m.meta_key = 'description' THEN m.meta_value END) as description,
      MAX(CASE WHEN m.meta_key = 'wp_capabilities' THEN m.meta_value END) as capabilities,
      MAX(CASE WHEN m.meta_key = 'pmpro_stripe_customerid' THEN m.meta_value END) as stripe_customer_id,
      MAX(CASE WHEN m.meta_key = 'pmpro_bfirstname' THEN m.meta_value END) as billing_first_name,
      MAX(CASE WHEN m.meta_key = 'pmpro_blastname' THEN m.meta_value END) as billing_last_name,
      MAX(CASE WHEN m.meta_key = 'pmpro_baddress1' THEN m.meta_value END) as billing_address1,
      MAX(CASE WHEN m.meta_key = 'pmpro_bcity' THEN m.meta_value END) as billing_city,
      MAX(CASE WHEN m.meta_key = 'pmpro_bstate' THEN m.meta_value END) as billing_state,
      MAX(CASE WHEN m.meta_key = 'pmpro_bzipcode' THEN m.meta_value END) as billing_zip,
      MAX(CASE WHEN m.meta_key = 'pmpro_bcountry' THEN m.meta_value END) as billing_country,
      MAX(CASE WHEN m.meta_key = 'pmpro_bphone' THEN m.meta_value END) as billing_phone,
      MAX(CASE WHEN m.meta_key = 'pmpro_bemail' THEN m.meta_value END) as billing_email,
      MAX(CASE WHEN m.meta_key = 'pmpro_CardType' THEN m.meta_value END) as card_type,
      MAX(CASE WHEN m.meta_key = 'pmpro_AccountNumber' THEN m.meta_value END) as card_last4,
      MAX(CASE WHEN m.meta_key = 'pmpro_ExpirationMonth' THEN m.meta_value END) as card_exp_month,
      MAX(CASE WHEN m.meta_key = 'pmpro_ExpirationYear' THEN m.meta_value END) as card_exp_year
    FROM wp_users u
    LEFT JOIN wp_usermeta m ON u.ID = m.user_id
    WHERE u.user_login != 'admin'
    GROUP BY u.ID
  `)
  return rows
}

async function getWpMemberships(conn) {
  const [rows] = await conn.query(`
    SELECT
      mu.user_id as wp_user_id,
      mu.membership_id as wp_level_id,
      mu.status,
      mu.startdate,
      mu.enddate,
      mu.modified
    FROM wp_pmpro_memberships_users mu
    ORDER BY mu.user_id, mu.modified DESC
  `)
  return rows
}

// Map WP PMPro statuses to our Supabase enum values
function mapMembershipStatus(wpStatus) {
  const map = {
    'active': 'active',
    'inactive': 'inactive',
    'cancelled': 'cancelled',
    'admin_cancelled': 'cancelled',
    'expired': 'expired',
    'admin_changed': 'inactive',
    'changed': 'inactive',
    'pending': 'pending',
  }
  return map[wpStatus] || 'inactive'
}

function parseWpRole(capabilities) {
  if (!capabilities) return 'subscriber'
  if (capabilities.includes('administrator')) return 'administrator'
  if (capabilities.includes('editor')) return 'editor'
  if (capabilities.includes('author')) return 'author'
  if (capabilities.includes('contributor')) return 'contributor'
  return 'subscriber'
}

async function getAllAuthUsersByEmail() {
  const emailMap = new Map() // email -> supabase user id
  let page = 1
  const perPage = 1000
  while (true) {
    const { data: { users }, error } = await sb.auth.admin.listUsers({ page, perPage })
    if (error) { console.error('Error listing auth users:', error); break }
    if (!users || users.length === 0) break
    for (const u of users) {
      if (u.email) emailMap.set(u.email.toLowerCase(), u.id)
    }
    if (users.length < perPage) break
    page++
  }
  return emailMap
}

async function getAllProfiles() {
  const profiles = new Map() // supabase id -> profile
  let page = 0
  while (true) {
    const { data } = await sb.from('user_profiles').select('id, wp_id, display_name').range(page * 1000, page * 1000 + 999)
    if (!data || data.length === 0) break
    for (const p of data) profiles.set(p.id, p)
    if (data.length < 1000) break
    page++
  }
  return profiles
}

async function run() {
  console.log('Connecting to WordPress MySQL...')
  const conn = await mysql.createConnection({
    socketPath: MYSQL_SOCK,
    user: 'root',
    password: 'root',
    database: 'local',
  })

  console.log('Fetching WordPress users...')
  const wpUsers = await getWpUsers(conn)
  console.log(`Found ${wpUsers.length} WordPress users`)

  console.log('Fetching WordPress memberships...')
  const wpMemberships = await getWpMemberships(conn)
  console.log(`Found ${wpMemberships.length} membership records`)

  // Group memberships by WP user ID
  const membershipsByWpUser = new Map()
  for (const m of wpMemberships) {
    if (!membershipsByWpUser.has(m.wp_user_id)) membershipsByWpUser.set(m.wp_user_id, [])
    membershipsByWpUser.get(m.wp_user_id).push(m)
  }

  console.log('Fetching existing Supabase auth users...')
  const existingAuthByEmail = await getAllAuthUsersByEmail()
  console.log(`Found ${existingAuthByEmail.size} existing auth users`)

  console.log('Fetching existing profiles...')
  const existingProfiles = await getAllProfiles()
  console.log(`Found ${existingProfiles.size} existing profiles`)

  // Build WP level ID -> Supabase level ID mapping
  const { data: sbLevels } = await sb.from('membership_levels').select('id, wp_id')
  const levelMap = new Map()
  for (const l of (sbLevels || [])) {
    if (l.wp_id) levelMap.set(l.wp_id, l.id)
  }
  console.log('Level mappings:', Object.fromEntries(levelMap))

  let created = 0, updated = 0, skipped = 0, errors = 0
  let membershipsCreated = 0, membershipsUpdated = 0

  for (const wpUser of wpUsers) {
    const email = wpUser.user_email?.toLowerCase()?.trim()
    if (!email || !email.includes('@')) {
      skipped++
      continue
    }

    const wpRole = parseWpRole(wpUser.capabilities)
    const supabaseRole = wpRole === 'administrator' ? 'admin' : 'member'

    try {
      let supabaseUserId = existingAuthByEmail.get(email)

      // Step 1: Create auth user if doesn't exist
      if (!supabaseUserId) {
        // Generate a random secure password — users will use password reset to set their own
        const tempPassword = `WPMigrated_${wpUser.wp_id}_${Date.now()}_${Math.random().toString(36).slice(2)}`

        const { data: authData, error: authErr } = await sb.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true, // Mark as confirmed so they don't need to verify
          user_metadata: {
            wp_id: wpUser.wp_id,
            display_name: wpUser.display_name || wpUser.user_login,
          }
        })

        if (authErr) {
          // User might already exist with different casing
          if (authErr.message?.includes('already been registered')) {
            // Try to find by email
            const { data: { users } } = await sb.auth.admin.listUsers()
            const found = users?.find(u => u.email?.toLowerCase() === email)
            if (found) {
              supabaseUserId = found.id
            } else {
              console.error(`  [${wpUser.wp_id}] Cannot find existing user for ${email}: ${authErr.message}`)
              errors++
              continue
            }
          } else {
            console.error(`  [${wpUser.wp_id}] Auth create error for ${email}: ${authErr.message}`)
            errors++
            continue
          }
        } else {
          supabaseUserId = authData.user.id
          created++
        }
      }

      // Step 2: Upsert user_profiles
      // Never downgrade existing admins — check current role first
      const { data: existingProfile } = await sb.from('user_profiles').select('role').eq('id', supabaseUserId).single()
      const isExistingAdmin = existingProfile?.role === 'admin'

      const profileData = {
        id: supabaseUserId,
        wp_id: wpUser.wp_id,
        first_name: wpUser.first_name || null,
        last_name: wpUser.last_name || null,
        display_name: wpUser.display_name || wpUser.user_login || email,
        nickname: wpUser.nickname || null,
        description: wpUser.description || null,
        website: wpUser.user_url || null,
        wp_role: isExistingAdmin ? 'administrator' : wpRole,
        role: isExistingAdmin ? 'admin' : supabaseRole,
        wp_registered_at: wpUser.user_registered || null,
      }

      const { error: profileErr } = await sb.from('user_profiles').upsert(profileData, { onConflict: 'id' })
      if (profileErr) {
        console.error(`  [${wpUser.wp_id}] Profile upsert error: ${profileErr.message}`)
        errors++
      } else {
        updated++
      }

      // Step 3: Sync memberships
      const userMemberships = membershipsByWpUser.get(wpUser.wp_id) || []
      for (const wm of userMemberships) {
        const sbLevelId = levelMap.get(wm.wp_level_id)
        if (!sbLevelId) continue // Skip memberships for unknown levels

        const enddate = wm.enddate && wm.enddate !== '0000-00-00 00:00:00' ? wm.enddate : null
        const startdate = wm.startdate && wm.startdate !== '0000-00-00 00:00:00' ? wm.startdate : null
        const mappedStatus = mapMembershipStatus(wm.status)

        const membershipData = {
          user_id: supabaseUserId,
          level_id: sbLevelId,
          status: mappedStatus,
          startdate,
          enddate,
          modified: wm.modified || new Date().toISOString(),
          billing_first_name: wpUser.billing_first_name || null,
          billing_last_name: wpUser.billing_last_name || null,
          billing_address1: wpUser.billing_address1 || null,
          billing_city: wpUser.billing_city || null,
          billing_state: wpUser.billing_state || null,
          billing_zip: wpUser.billing_zip || null,
          billing_country: wpUser.billing_country || null,
          billing_phone: wpUser.billing_phone || null,
          billing_email: wpUser.billing_email || null,
          stripe_customer_id: wpUser.stripe_customer_id || null,
          card_type: wpUser.card_type || null,
          card_last4: wpUser.card_last4 || null,
          card_exp_month: wpUser.card_exp_month || null,
          card_exp_year: wpUser.card_exp_year || null,
        }

        // Check if membership already exists for this user+level+status combo
        const { data: existing } = await sb
          .from('user_memberships')
          .select('id')
          .eq('user_id', supabaseUserId)
          .eq('level_id', sbLevelId)
          .eq('status', mappedStatus)
          .limit(1)

        if (existing && existing.length > 0) {
          // Update existing
          const { error: mErr } = await sb
            .from('user_memberships')
            .update(membershipData)
            .eq('id', existing[0].id)
          if (mErr) console.error(`  [${wpUser.wp_id}] Membership update error: ${mErr.message}`)
          else membershipsUpdated++
        } else {
          // Insert new
          const { error: mErr } = await sb
            .from('user_memberships')
            .insert(membershipData)
          if (mErr) console.error(`  [${wpUser.wp_id}] Membership insert error: ${mErr.message}`)
          else membershipsCreated++
        }
      }

    } catch (err) {
      console.error(`  [${wpUser.wp_id}] Unexpected error: ${err.message}`)
      errors++
    }

    // Progress logging
    const total = created + updated + skipped + errors
    if (total % 100 === 0) {
      console.log(`  Progress: ${total}/${wpUsers.length} (created: ${created}, updated: ${updated}, skipped: ${skipped}, errors: ${errors})`)
    }
  }

  console.log('\n=== Migration Complete ===')
  console.log(`Auth users created: ${created}`)
  console.log(`Profiles updated: ${updated}`)
  console.log(`Skipped (no email): ${skipped}`)
  console.log(`Errors: ${errors}`)
  console.log(`Memberships created: ${membershipsCreated}`)
  console.log(`Memberships updated: ${membershipsUpdated}`)

  await conn.end()
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
