/**
 * Migrate WordPress 'production' CPT to Supabase productions table.
 * Also migrates taxonomy links (production_type_links, production_status_links).
 */
import { mysql, unserializePhp } from './db'
import { supabase, batchUpsert } from './supabase-admin'

function parseProductionDate(val: string | null): string | null {
  if (!val || val === '0' || val.length < 8) return null
  // Format: YYYYMMDD
  const y = val.slice(0, 4)
  const m = val.slice(4, 6)
  const d = val.slice(6, 8)
  const date = new Date(`${y}-${m}-${d}`)
  return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0]
}

export async function runProductionsMigration() {
  console.log('\n=== PRODUCTIONS MIGRATION ===')

  // Fetch all productions
  const posts = mysql(`
    SELECT p.ID, p.post_title, p.post_name, p.post_content, p.post_excerpt,
           p.post_status, p.post_date, p.post_modified, p.post_author
    FROM wp_posts p
    WHERE p.post_type = 'production' AND p.post_status IN ('publish', 'draft', 'private')
    ORDER BY p.ID ASC
  `)

  console.log(`  Found ${posts.length} productions`)

  // Fetch all meta in one query
  const allMeta = mysql(`
    SELECT post_id, meta_key, meta_value
    FROM wp_postmeta
    WHERE post_id IN (
      SELECT ID FROM wp_posts WHERE post_type = 'production'
        AND post_status IN ('publish', 'draft', 'private')
    )
    AND meta_key IN ('production_date_start', 'production_date_end', 'locations',
                     'locations_new', 'contact', 'roles', '_thumbnail_id', 'blog_linked',
                     'production_date_startpost', 'production_date_endpost')
    ORDER BY post_id, meta_key
  `)

  // Group meta by post_id
  const metaByPost: Record<string, Record<string, string>> = {}
  for (const m of allMeta) {
    if (!metaByPost[m.post_id]) metaByPost[m.post_id] = {}
    metaByPost[m.post_id][m.meta_key] = m.meta_value
  }

  // Fetch taxonomy relationships
  const typeLinks = mysql(`
    SELECT p.ID as post_id, t.term_id
    FROM wp_posts p
    JOIN wp_term_relationships tr ON tr.object_id = p.ID
    JOIN wp_term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
      AND tt.taxonomy = 'production-type'
    JOIN wp_terms t ON t.term_id = tt.term_id
    WHERE p.post_type = 'production'
  `)

  const statusLinks = mysql(`
    SELECT p.ID as post_id, t.term_id
    FROM wp_posts p
    JOIN wp_term_relationships tr ON tr.object_id = p.ID
    JOIN wp_term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
      AND tt.taxonomy = 'production-union'
    JOIN wp_terms t ON t.term_id = tt.term_id
    WHERE p.post_type = 'production'
  `)

  // Build productions rows
  const productionRows = posts.map((p) => {
    const meta = metaByPost[p.ID] ?? {}
    const locationsRaw = meta.locations_new || meta.locations || null
    const contactRaw = meta.contact || null
    const rolesRaw = meta.roles || null

    let locationsJson: any = null
    try {
      if (locationsRaw) locationsJson = unserializePhp(locationsRaw)
    } catch {}

    return {
      id: parseInt(p.ID, 10),
      title: p.post_title,
      slug: p.post_name,
      content: p.post_content || null,
      excerpt: p.post_excerpt || null,
      visibility: p.post_status === 'publish' ? 'public'
        : p.post_status === 'private' ? 'members_only' : 'draft',
      date_start: parseProductionDate(meta.production_date_start || meta.production_date_startpost),
      date_end: parseProductionDate(meta.production_date_end || meta.production_date_endpost),
      thumbnail_id: meta._thumbnail_id ? parseInt(meta._thumbnail_id, 10) : null,
      _raw_contact: contactRaw ? JSON.stringify(unserializePhp(contactRaw)) : null,
      _raw_roles: rolesRaw ? JSON.stringify(unserializePhp(rolesRaw)) : null,
      _raw_locations: locationsRaw ? JSON.stringify(locationsJson) : null,
      wp_id: parseInt(p.ID, 10),
      created_at: p.post_date ? new Date(p.post_date).toISOString() : null,
      updated_at: p.post_modified ? new Date(p.post_modified).toISOString() : null,
    }
  })

  await batchUpsert('productions', productionRows, 200, 'id')

  // Type links
  const typeRows = typeLinks.map((r) => ({
    production_id: parseInt(r.post_id, 10),
    type_id: parseInt(r.term_id, 10),
  }))
  if (typeRows.length > 0) {
    await batchUpsert('production_type_links', typeRows, 500)
  }

  // Status links
  const statusRows = statusLinks.map((r) => ({
    production_id: parseInt(r.post_id, 10),
    status_id: parseInt(r.term_id, 10),
  }))
  if (statusRows.length > 0) {
    await batchUpsert('production_status_links', statusRows, 500)
  }

  // Parse locations into production_locations table
  await migrateProductionLocations(posts, metaByPost)

  console.log('\n✓ Productions migration complete.')
}

async function migrateProductionLocations(
  posts: any[],
  metaByPost: Record<string, Record<string, string>>
) {
  console.log('\n  → Migrating production locations...')
  const locationRows: any[] = []

  for (const p of posts) {
    const meta = metaByPost[p.ID] ?? {}
    const raw = meta.locations_new || meta.locations
    if (!raw) continue

    const parsed = unserializePhp(raw)
    if (!parsed) continue

    // locations_new is array of location strings or objects
    const locations = Array.isArray(parsed) ? parsed : Object.values(parsed)
    for (const loc of locations) {
      if (!loc) continue
      locationRows.push({
        production_id: parseInt(p.ID, 10),
        location_text: typeof loc === 'string' ? loc : JSON.stringify(loc),
      })
    }
  }

  if (locationRows.length > 0) {
    // Delete existing and re-insert (no stable ID)
    await supabase.from('production_locations').delete().gte('production_id', 1)
    await batchUpsert('production_locations', locationRows, 500)
  }
}

if (require.main === module) {
  runProductionsMigration().catch((e) => { console.error(e); process.exit(1) })
}
