/**
 * Migrate WordPress 'production-contact' CPT → Supabase companies table.
 * Also migrates company_category_links.
 */
import { mysql, unserializePhp } from './db'
import { batchUpsert } from './supabase-admin'

export async function runContactsMigration() {
  console.log('\n=== COMPANIES (production-contact) MIGRATION ===')

  const posts = mysql(`
    SELECT p.ID, p.post_title, p.post_name, p.post_content, p.post_excerpt,
           p.post_status, p.post_date, p.post_modified
    FROM wp_posts p
    WHERE p.post_type = 'production-contact'
      AND p.post_status IN ('publish', 'draft', 'private')
    ORDER BY p.ID ASC
  `)

  console.log(`  Found ${posts.length} companies`)

  const allMeta = mysql(`
    SELECT post_id, meta_key, meta_value
    FROM wp_postmeta
    WHERE post_id IN (
      SELECT ID FROM wp_posts WHERE post_type = 'production-contact'
        AND post_status IN ('publish', 'draft', 'private')
    )
    AND meta_key IN ('address', 'phone', 'fax', 'email', 'linkedin', 'twitter',
                     '_thumbnail_id', 'staffs')
    ORDER BY post_id, meta_key
  `)

  const metaByPost: Record<string, Record<string, string>> = {}
  for (const m of allMeta) {
    if (!metaByPost[m.post_id]) metaByPost[m.post_id] = {}
    metaByPost[m.post_id][m.meta_key] = m.meta_value
  }

  // Category links
  const catLinks = mysql(`
    SELECT p.ID as post_id, t.term_id
    FROM wp_posts p
    JOIN wp_term_relationships tr ON tr.object_id = p.ID
    JOIN wp_term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
      AND tt.taxonomy = 'production-ccat'
    JOIN wp_terms t ON t.term_id = tt.term_id
    WHERE p.post_type = 'production-contact'
  `)

  // Build company rows
  const companyRows = posts.map((p) => {
    const meta = metaByPost[p.ID] ?? {}
    const staffsRaw = meta.staffs || null
    let staffsJson: any = null
    try {
      if (staffsRaw) staffsJson = unserializePhp(staffsRaw)
    } catch {}

    return {
      id: parseInt(p.ID, 10),
      title: p.post_title,
      slug: p.post_name,
      content: p.post_content || null,
      excerpt: p.post_excerpt || null,
      visibility: p.post_status === 'publish' ? 'public'
        : p.post_status === 'private' ? 'members_only' : 'draft',
      address: meta.address || null,
      phone: meta.phone || null,
      fax: meta.fax || null,
      email: meta.email || null,
      linkedin: meta.linkedin || null,
      twitter: meta.twitter || null,
      thumbnail_id: meta._thumbnail_id ? parseInt(meta._thumbnail_id, 10) : null,
      _raw_staffs: staffsJson ? JSON.stringify(staffsJson) : null,
      wp_id: parseInt(p.ID, 10),
      created_at: p.post_date ? new Date(p.post_date).toISOString() : null,
      updated_at: p.post_modified ? new Date(p.post_modified).toISOString() : null,
    }
  })

  await batchUpsert('companies', companyRows, 200, 'id')

  // Category links
  const catRows = catLinks.map((r) => ({
    company_id: parseInt(r.post_id, 10),
    category_id: parseInt(r.term_id, 10),
  }))
  if (catRows.length > 0) {
    await batchUpsert('company_category_links', catRows, 500)
  }

  // Migrate ACF staffs repeater into company_staff table
  await migrateCompanyStaff(posts, metaByPost)

  console.log('\n✓ Companies migration complete.')
}

async function migrateCompanyStaff(
  posts: any[],
  metaByPost: Record<string, Record<string, string>>
) {
  console.log('\n  → Migrating company staff (ACF repeater)...')

  // ACF stores repeater rows as individual meta keys:
  // staffs = count
  // staffs_0_name = value
  // staffs_0_role = value
  // staffs_0_email = value
  // etc.

  // Fetch all ACF staff meta
  const staffMeta = mysql(`
    SELECT post_id, meta_key, meta_value
    FROM wp_postmeta
    WHERE post_id IN (
      SELECT ID FROM wp_posts WHERE post_type = 'production-contact'
        AND post_status IN ('publish', 'draft', 'private')
    )
    AND meta_key LIKE 'staffs_%'
    ORDER BY post_id, meta_key
  `)

  const staffByPost: Record<string, Record<string, string>> = {}
  for (const m of staffMeta) {
    if (!staffByPost[m.post_id]) staffByPost[m.post_id] = {}
    staffByPost[m.post_id][m.meta_key] = m.meta_value
  }

  const staffRows: any[] = []

  for (const p of posts) {
    const companyId = parseInt(p.ID, 10)
    const staffs = staffByPost[p.ID] ?? {}
    const count = parseInt(staffs['staffs'] || '0', 10)

    for (let i = 0; i < count; i++) {
      const name = staffs[`staffs_${i}_name`] || staffs[`staffs_${i}_staff_name`] || null
      const role = staffs[`staffs_${i}_role`] || staffs[`staffs_${i}_staff_role`] || null
      const email = staffs[`staffs_${i}_email`] || staffs[`staffs_${i}_staff_email`] || null
      const phone = staffs[`staffs_${i}_phone`] || staffs[`staffs_${i}_staff_phone`] || null

      if (!name && !email) continue

      staffRows.push({
        company_id: companyId,
        name: name,
        role: role,
        email: email,
        phone: phone,
        sort_order: i,
      })
    }
  }

  if (staffRows.length > 0) {
    // Delete and re-insert
    const { error } = await (await import('./supabase-admin')).supabase
      .from('company_staff')
      .delete()
      .gte('company_id', 1)
    await batchUpsert('company_staff', staffRows, 500)
    console.log(`  Migrated ${staffRows.length} staff records`)
  }
}

if (require.main === module) {
  runContactsMigration().catch((e) => { console.error(e); process.exit(1) })
}
