/**
 * Migrate WordPress 'production-role' CPT → Supabase crew_members table.
 * Also migrates crew_category_links.
 */
import { mysql, unserializePhp } from './db'
import { batchUpsert } from './supabase-admin'

export async function runCrewMigration() {
  console.log('\n=== CREW MEMBERS (production-role) MIGRATION ===')

  const posts = mysql(`
    SELECT p.ID, p.post_title, p.post_name, p.post_content, p.post_excerpt,
           p.post_status, p.post_date, p.post_modified
    FROM wp_posts p
    WHERE p.post_type = 'production-role'
      AND p.post_status IN ('publish', 'draft', 'private')
    ORDER BY p.ID ASC
  `)

  console.log(`  Found ${posts.length} crew members`)

  const allMeta = mysql(`
    SELECT post_id, meta_key, meta_value
    FROM wp_postmeta
    WHERE post_id IN (
      SELECT ID FROM wp_posts WHERE post_type = 'production-role'
        AND post_status IN ('publish', 'draft', 'private')
    )
    AND meta_key IN ('linkedin', 'emails', 'phones', 'twitter', '_thumbnail_id')
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
      AND tt.taxonomy = 'production-rcat'
    JOIN wp_terms t ON t.term_id = tt.term_id
    WHERE p.post_type = 'production-role'
  `)

  const crewRows = posts.map((p) => {
    const meta = metaByPost[p.ID] ?? {}

    // emails and phones may be serialized or plain
    let emails: string[] = []
    let phones: string[] = []

    try {
      const em = unserializePhp(meta.emails || '')
      if (Array.isArray(em)) emails = em.filter(Boolean)
      else if (typeof em === 'string' && em) emails = [em]
    } catch {
      if (meta.emails) emails = [meta.emails]
    }

    try {
      const ph = unserializePhp(meta.phones || '')
      if (Array.isArray(ph)) phones = ph.filter(Boolean)
      else if (typeof ph === 'string' && ph) phones = [ph]
    } catch {
      if (meta.phones) phones = [meta.phones]
    }

    return {
      id: parseInt(p.ID, 10),
      wp_id: parseInt(p.ID, 10),
      name: p.post_title,
      slug: p.post_name,
      visibility: p.post_status === 'publish' ? 'publish'
        : p.post_status === 'private' ? 'private' : 'draft',
      linkedin: meta.linkedin || null,
      twitter: meta.twitter || null,
      emails: emails.length > 0 ? emails : [],
      phones: phones.length > 0 ? phones : [],
      wp_created_at: p.post_date ? new Date(p.post_date).toISOString() : null,
      wp_updated_at: p.post_modified ? new Date(p.post_modified).toISOString() : null,
    }
  })

  const validRows = crewRows.filter(r => r.id && !isNaN(r.id) && r.name)
  console.log(`  Filtered: ${crewRows.length} → ${validRows.length} valid rows`)
  await batchUpsert('crew_members', validRows, 200, 'id')

  // Category links
  const catRows = catLinks.map((r) => ({
    crew_id: parseInt(r.post_id, 10),
    category_id: parseInt(r.term_id, 10),
  }))
  if (catRows.length > 0) {
    await batchUpsert('crew_category_links', catRows, 500)
  }

  console.log('\n✓ Crew migration complete.')
}

if (require.main === module) {
  runCrewMigration().catch((e) => { console.error(e); process.exit(1) })
}
