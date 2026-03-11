/**
 * Migrate PMPro membership data → Supabase user_memberships + membership_orders.
 *
 * Reads from PMPro tables:
 *   pmpro_memberships_users  → user_memberships
 *   pmpro_membership_orders  → membership_orders
 *   pmpro_discount_codes     → discount_codes
 */
import { mysql } from './db'
import { supabase, batchUpsert } from './supabase-admin'

export async function runMembershipsMigration() {
  console.log('\n=== MEMBERSHIPS MIGRATION ===')

  // Load Supabase user ID ↔ WP user ID mapping
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, wp_user_id, email')
    .not('wp_user_id', 'is', null)

  const wpToSupabase: Record<number, string> = {}
  const emailToSupabase: Record<string, string> = {}
  for (const p of profiles ?? []) {
    if (p.wp_user_id && p.id) wpToSupabase[p.wp_user_id] = p.id
    if (p.email && p.id) emailToSupabase[p.email.toLowerCase()] = p.id
  }

  // --- Active memberships ---
  const memberships = mysql(`
    SELECT mu.id, mu.user_id, mu.membership_id, mu.code_id,
           mu.initial_payment, mu.billing_amount, mu.billing_limit, mu.billing_period,
           mu.status, mu.startdate, mu.enddate,
           u.user_email
    FROM pmpro_memberships_users mu
    JOIN wp_users u ON u.ID = mu.user_id
    ORDER BY mu.id ASC
  `)

  console.log(`  Found ${memberships.length} membership records`)

  const membershipRows: any[] = []
  for (const m of memberships) {
    const userId = wpToSupabase[parseInt(m.user_id, 10)]
      || emailToSupabase[m.user_email?.toLowerCase()]
    if (!userId) continue

    membershipRows.push({
      user_id: userId,
      level_id: parseInt(m.membership_id, 10),
      status: m.status === 'active' ? 'active' : 'expired',
      startdate: m.startdate ? new Date(m.startdate).toISOString() : null,
      current_period_end: m.enddate && m.enddate !== '0000-00-00 00:00:00'
        ? new Date(m.enddate).toISOString()
        : null,
      stripe_subscription_id: null, // retrieved from orders below
    })
  }

  if (membershipRows.length > 0) {
    await batchUpsert('user_memberships', membershipRows, 200, 'user_id')
  }

  // --- Orders ---
  const orders = mysql(`
    SELECT o.id, o.user_id, o.membership_id, o.code_id,
           o.subtotal, o.tax, o.total, o.payment_type,
           o.cardtype, o.payment_transaction_id, o.subscription_transaction_id,
           o.status, o.timestamp,
           u.user_email
    FROM pmpro_membership_orders o
    JOIN wp_users u ON u.ID = o.user_id
    ORDER BY o.id ASC
  `)

  console.log(`  Found ${orders.length} order records`)

  const orderRows: any[] = []
  for (const o of orders) {
    const userId = wpToSupabase[parseInt(o.user_id, 10)]
      || emailToSupabase[o.user_email?.toLowerCase()]
    if (!userId) continue

    const total = Math.round(parseFloat(o.total || '0') * 100) // convert to cents

    orderRows.push({
      user_id: userId,
      level_id: parseInt(o.membership_id, 10),
      status: o.status === 'success' ? 'success' : o.status === 'pending' ? 'pending' : 'failed',
      total: total,
      gateway: o.payment_type || 'stripe',
      gateway_tx_id: o.payment_transaction_id || null,
      gateway_subscription_id: o.subscription_transaction_id || null,
      code_id: o.code_id && o.code_id !== '0' ? parseInt(o.code_id, 10) : null,
      created_at: o.timestamp ? new Date(parseInt(o.timestamp, 10) * 1000).toISOString() : null,
    })
  }

  if (orderRows.length > 0) {
    await batchUpsert('membership_orders', orderRows, 200)
  }

  // Update stripe_subscription_id on user_memberships from orders
  const subIdByUser: Record<string, string> = {}
  for (const o of orders) {
    const userId = wpToSupabase[parseInt(o.user_id, 10)]
    if (userId && o.subscription_transaction_id && o.status === 'success') {
      subIdByUser[userId] = o.subscription_transaction_id
    }
  }

  for (const [userId, subId] of Object.entries(subIdByUser)) {
    await supabase
      .from('user_memberships')
      .update({ stripe_subscription_id: subId })
      .eq('user_id', userId)
  }

  // --- Discount codes ---
  const codes = mysql(`
    SELECT dc.id, dc.code, dc.starts, dc.expires, dc.uses,
           dc.trial_amount, dc.trial_limit, dc.initial_payment,
           dc.billing_amount, dc.billing_limit, dc.billing_period,
           dc.description
    FROM pmpro_discount_codes dc
    ORDER BY dc.id ASC
  `)

  console.log(`  Found ${codes.length} discount codes`)

  if (codes.length > 0) {
    const codeRows = codes.map((c) => ({
      id: parseInt(c.id, 10),
      code: c.code,
      description: c.description || null,
      uses: parseInt(c.uses || '0', 10),
      starts: c.starts && c.starts !== '0000-00-00' ? new Date(c.starts).toISOString() : null,
      expires: c.expires && c.expires !== '0000-00-00' ? new Date(c.expires).toISOString() : null,
      discount_type: 'percent' as const,
      discount_amount: 0,
      created_at: new Date().toISOString(),
    }))

    await batchUpsert('discount_codes', codeRows, 200, 'id')

    // Code ↔ level associations
    const codeLevels = mysql(`
      SELECT dcl.code_id, dcl.level_id
      FROM pmpro_discount_codes_levels dcl
    `)

    if (codeLevels.length > 0) {
      const codeLevelRows = codeLevels.map((r) => ({
        code_id: parseInt(r.code_id, 10),
        level_id: parseInt(r.level_id, 10),
      }))
      await batchUpsert('discount_code_levels', codeLevelRows, 500)
    }
  }

  console.log('\n✓ Memberships migration complete.')
}

if (require.main === module) {
  runMembershipsMigration().catch((e) => { console.error(e); process.exit(1) })
}
