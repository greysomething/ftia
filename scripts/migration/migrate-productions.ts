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
      if (locationsRaw) locationsJson = deepUnserialize(locationsRaw)
    } catch {}

    return {
      id: parseInt(p.ID, 10),
      wp_id: parseInt(p.ID, 10),
      title: p.post_title,
      slug: p.post_name,
      content: p.post_content || null,
      excerpt: p.post_excerpt || null,
      visibility: p.post_status === 'publish' ? 'publish'
        : p.post_status === 'private' ? 'private' : 'draft',
      production_date_start: parseProductionDate(meta.production_date_start),
      production_date_end: parseProductionDate(meta.production_date_end),
      production_date_startpost: parseProductionDate(meta.production_date_startpost),
      production_date_endpost: parseProductionDate(meta.production_date_endpost),
      thumbnail_id: null, // set to null initially; media table populated later
      _raw_contact: contactRaw ? JSON.stringify(unserializePhp(contactRaw)) : null,
      _raw_roles: rolesRaw ? JSON.stringify(unserializePhp(rolesRaw)) : null,
      _raw_locations: locationsRaw ? JSON.stringify(locationsJson) : null,
      _raw_locations_new: meta.locations_new ? JSON.stringify(deepUnserialize(meta.locations_new)) : null,
      blog_linked: meta.blog_linked ? parseInt(meta.blog_linked, 10) : null,
      wp_author_id: p.post_author ? parseInt(p.post_author, 10) : null,
      wp_created_at: p.post_date ? new Date(p.post_date).toISOString() : null,
      wp_updated_at: p.post_modified ? new Date(p.post_modified).toISOString() : null,
    }
  })

  // Filter out rows with invalid IDs
  const validRows = productionRows.filter(r => r.id && !isNaN(r.id) && r.title)
  console.log(`  Filtered: ${productionRows.length} → ${validRows.length} valid rows`)
  await batchUpsert('productions', validRows, 200, 'id')

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

/** Recursively unserialize PHP data — handles double-serialized values */
function deepUnserialize(raw: string): any {
  let val = unserializePhp(raw)
  // If the result is still a serialized PHP string, unserialize again
  while (typeof val === 'string' && /^[aOsbiNd]:/.test(val)) {
    const next = unserializePhp(val)
    if (next === null || next === val) break
    val = next
  }
  // If still a string (corrupted serialization), try regex extraction
  if (typeof val === 'string' && val.includes('"city"')) {
    return regexExtractLocations(val)
  }
  return val
}

/** Fallback: extract city/stage/country from corrupted PHP serialized data via regex */
function regexExtractLocations(raw: string): any[] {
  const locations: any[] = []
  // Match quoted string values after field names in serialized format
  // Pattern: s:N:"fieldname";s:N:"value" — also handles truncated data
  const cityMatch = raw.match(/"city";s:\d+:"([^"]+)/)
  const stageMatch = raw.match(/"stage";s:\d+:"([^"]+)/)
  const countryMatch = raw.match(/"country";s:\d+:"([^"]+)/)

  if (cityMatch || countryMatch) {
    locations.push({
      city: cityMatch?.[1]?.replace(/".*/, '') || '',
      stage: stageMatch?.[1]?.replace(/".*/, '') || '',
      country: countryMatch?.[1]?.replace(/".*/, '') || '',
    })
  }
  return locations.length > 0 ? locations : []
}

async function migrateProductionLocations(
  posts: any[],
  metaByPost: Record<string, Record<string, string>>
) {
  console.log('\n  → Migrating production locations...')
  const locationRows: any[] = []

  for (const p of posts) {
    const meta = metaByPost[p.ID] ?? {}
    // Prefer locations_new (structured), fall back to locations (plain strings)
    // WordPress stores these as double-serialized: s:NNN:"a:...{...}"
    let parsed: any = null
    if (meta.locations_new) {
      parsed = deepUnserialize(meta.locations_new)
    }
    // If locations_new is empty/null, try old format
    if (!parsed || (Array.isArray(parsed) && parsed.length === 0)) {
      if (meta.locations) {
        parsed = deepUnserialize(meta.locations)
      }
    }
    if (!parsed) continue

    // locations_new is array of location strings or objects
    const locations = Array.isArray(parsed) ? parsed : Object.values(parsed)
    let sortIdx = 0
    for (const loc of locations) {
      if (!loc) continue
      const isObj = typeof loc === 'object' && loc !== null
      const city = isObj ? (loc.city || null) : null
      const stage = isObj ? (loc.stage || null) : null
      const country = isObj ? (loc.country || null) : null

      // Build a human-readable location string from components
      let locStr: string
      if (typeof loc === 'string') {
        locStr = loc
      } else {
        const parts = [city, stage, country].filter(Boolean)
        locStr = parts.length > 0 ? parts.join(', ') : (loc.location || loc.name || '')
      }
      if (!locStr) continue

      locationRows.push({
        production_id: parseInt(p.ID, 10),
        location: locStr,
        stage,
        city,
        country,
        sort_order: sortIdx++,
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
