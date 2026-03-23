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
  let attempts = 0
  while (typeof val === 'string' && /^[aOsbiNd]:/.test(val) && attempts < 5) {
    const next = unserializePhp(val)
    if (next === null || next === val) break
    val = next
    attempts++
  }
  return val
}

/**
 * Extract locations from the NEW format (structured objects with city/stage/country).
 * These are double-serialized PHP arrays of {city, stage, country} objects.
 */
function parseLocationsNew(raw: string): Array<{ city: string; stage: string; country: string }> {
  // First try proper deserialization
  const parsed = deepUnserialize(raw)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    // It's an associative array / object — convert values to array
    const arr = Object.values(parsed)
    if (arr.length > 0 && typeof arr[0] === 'object') return arr as any
  }
  if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
    return parsed as any
  }

  // Fallback: regex extract ALL location objects from the raw serialized string
  // This handles cases where deserialization fails (corrupted data)
  const results: Array<{ city: string; stage: string; country: string }> = []
  // Find all city/stage/country triplets in the serialized data
  const pattern = /"city";s:\d+:"([^"]*)";\s*s:\d+:"stage";s:\d+:"([^"]*)";\s*s:\d+:"country";s:\d+:"([^"]*)"/g
  let match
  // Work on the fully "unwrapped" string (one level of s:NNN:"..." wrapper removed)
  let haystack = raw
  const outerMatch = raw.match(/^s:\d+:"([\s\S]+)";?$/)
  if (outerMatch) haystack = outerMatch[1]

  while ((match = pattern.exec(haystack)) !== null) {
    results.push({
      city: match[1].trim(),
      stage: match[2].trim(),
      country: match[3].trim(),
    })
  }
  return results
}

/**
 * Extract locations from the OLD format (plain string array).
 * These are double-serialized PHP arrays of plain strings like "Los Angeles", "NY", "Toronto / Cuba".
 */
function parseLocationsOld(raw: string): string[] {
  const parsed = deepUnserialize(raw)
  if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
    return parsed.filter(Boolean)
  }

  // Fallback: regex extract quoted strings from serialized data
  const results: string[] = []
  let haystack = raw
  const outerMatch = raw.match(/^s:\d+:"([\s\S]+)";?$/)
  if (outerMatch) haystack = outerMatch[1]

  // Match s:N:"value" patterns inside the array
  const pattern = /i:\d+;s:\d+:"([^"]+)"/g
  let match
  while ((match = pattern.exec(haystack)) !== null) {
    const val = match[1].trim()
    if (val && val !== 'TBA' && val.length > 1) results.push(val)
    else if (val === 'TBA') results.push(val)
  }
  return results
}

/** Clean up encoding issues from PHP/MySQL (latin1 → utf8 artifacts) */
function fixEncoding(str: string): string {
  return str
    .replace(/\uFFFD/g, '') // replacement character
    .replace(/�/g, '')
    .replace(/\t/g, ' ')     // tabs in stage fields
    .trim()
}

async function migrateProductionLocations(
  posts: any[],
  metaByPost: Record<string, Record<string, string>>
) {
  console.log('\n  → Migrating production locations...')
  const locationRows: any[] = []
  let skippedEmpty = 0
  let fromNew = 0
  let fromOld = 0

  for (const p of posts) {
    const meta = metaByPost[p.ID] ?? {}
    const prodId = parseInt(p.ID, 10)

    // === Try locations_new first (structured: city/stage/country) ===
    if (meta.locations_new && meta.locations_new.length > 10
        && meta.locations_new !== 'a:0:{}'
        && meta.locations_new !== 'N;'
        && meta.locations_new !== 's:6:"a:0:{}"') {
      const locs = parseLocationsNew(meta.locations_new)
      if (locs.length > 0) {
        fromNew++
        locs.forEach((loc, idx) => {
          const city = fixEncoding(loc.city || '')
          const stage = fixEncoding(loc.stage || '')
          const country = fixEncoding(loc.country || '')

          if (!city && !stage && !country) { skippedEmpty++; return }

          // Build display string
          const isUS = country === 'United States' || country === 'US'
          const isCanada = country === 'Canada'
          const isUK = country === 'United Kingdom' || country === 'UK'

          let locStr: string
          if ((isUS || isCanada) && city && stage) {
            locStr = `${city}, ${stage}`
          } else if (isUK && city && stage) {
            locStr = `${city}, ${stage}`
          } else if (isUK && city) {
            locStr = city
          } else {
            const parts = [city, stage, country].filter(Boolean)
            locStr = parts.join(', ')
          }

          locationRows.push({
            production_id: prodId,
            location: locStr || null,
            city: city || null,
            stage: stage || null,
            country: country || null,
            sort_order: idx,
          })
        })
        continue // Skip old format if new format had data
      }
    }

    // === Fall back to locations (old format: plain strings) ===
    if (meta.locations && meta.locations.length > 10
        && meta.locations !== 'a:0:{}'
        && meta.locations !== 'N;'
        && meta.locations !== 's:6:"a:0:{}"') {
      const locs = parseLocationsOld(meta.locations)
      if (locs.length > 0) {
        fromOld++
        locs.forEach((locStr, idx) => {
          const clean = fixEncoding(locStr)
          if (!clean || clean.length <= 1) { skippedEmpty++; return }

          locationRows.push({
            production_id: prodId,
            location: clean,
            city: null,
            stage: null,
            country: null,
            sort_order: idx,
          })
        })
      }
    }
  }

  console.log(`  → Built ${locationRows.length} location rows (${fromNew} from locations_new, ${fromOld} from locations, ${skippedEmpty} skipped empty)`)

  if (locationRows.length > 0) {
    // Delete existing and re-insert (no stable ID)
    await supabase.from('production_locations').delete().gte('production_id', 1)
    console.log('  → Cleared existing production_locations')
    await batchUpsert('production_locations', locationRows, 500)
  }
}

if (require.main === module) {
  runProductionsMigration().catch((e) => { console.error(e); process.exit(1) })
}
