/**
 * Re-migrate production locations with fixed deep-unserialization.
 * Run: npx tsx scripts/migration/remigrate-locations.ts
 */
import { mysql, unserializePhp } from './db'
import { supabase, batchUpsert } from './supabase-admin'

function deepUnserialize(raw: string): any {
  let val = unserializePhp(raw)
  while (typeof val === 'string' && /^[aOsbiNd]:/.test(val)) {
    const next = unserializePhp(val)
    if (next === null || next === val) break
    val = next
  }
  if (typeof val === 'string' && val.includes('"city"')) {
    return regexExtractLocations(val)
  }
  return val
}

function regexExtractLocations(raw: string): any[] {
  const cityMatch = raw.match(/"city";s:\d+:"([^"]+)/)
  const stageMatch = raw.match(/"stage";s:\d+:"([^"]+)/)
  const countryMatch = raw.match(/"country";s:\d+:"([^"]+)/)
  if (cityMatch || countryMatch) {
    return [{
      city: cityMatch?.[1]?.replace(/".*/, '') || '',
      stage: stageMatch?.[1]?.replace(/".*/, '') || '',
      country: countryMatch?.[1]?.replace(/".*/, '') || '',
    }]
  }
  return []
}

async function run() {
  console.log('Fetching production posts...')
  const posts = mysql(`
    SELECT p.ID FROM wp_posts p
    WHERE p.post_type = 'production' AND p.post_status IN ('publish', 'draft', 'private')
  `)

  console.log(`Found ${posts.length} productions`)

  console.log('Fetching location meta...')
  const allMeta = mysql(`
    SELECT post_id, meta_key, meta_value FROM wp_postmeta
    WHERE post_id IN (SELECT ID FROM wp_posts WHERE post_type = 'production' AND post_status IN ('publish', 'draft', 'private'))
    AND meta_key IN ('locations', 'locations_new')
    AND meta_value IS NOT NULL AND meta_value != '' AND meta_value != 'N;'
    AND meta_value NOT LIKE 's:2:"N;";'
  `)

  const metaByPost: Record<string, Record<string, string>> = {}
  for (const m of allMeta) {
    if (!metaByPost[m.post_id]) metaByPost[m.post_id] = {}
    metaByPost[m.post_id][m.meta_key] = m.meta_value
  }

  console.log(`Found meta for ${Object.keys(metaByPost).length} productions`)

  console.log('Building location rows...')
  const locationRows: any[] = []
  let skippedEmpty = 0

  for (const p of posts) {
    const meta = metaByPost[p.ID] ?? {}
    let parsed: any = null

    if (meta.locations_new) {
      parsed = deepUnserialize(meta.locations_new)
    }
    if (!parsed || (Array.isArray(parsed) && parsed.length === 0)) {
      if (meta.locations) {
        parsed = deepUnserialize(meta.locations)
      }
    }
    if (!parsed) continue

    const locations = Array.isArray(parsed) ? parsed : Object.values(parsed)
    let sortIdx = 0

    for (const loc of locations) {
      if (!loc) continue
      const isObj = typeof loc === 'object' && loc !== null
      const city = isObj ? (loc.city || null) : null
      const stage = isObj ? (loc.stage || null) : null
      const country = isObj ? (loc.country || null) : null

      let locStr: string
      if (typeof loc === 'string') {
        if (loc === 'TBA' || loc === 'N/A' || loc === '') {
          skippedEmpty++
          continue
        }
        locStr = loc
      } else {
        const parts = [city, stage, country].filter(Boolean)
        locStr = parts.length > 0 ? parts.join(', ') : ''
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

  console.log(`Total location rows: ${locationRows.length} (skipped ${skippedEmpty} TBA/empty)`)

  // Delete existing and re-insert
  console.log('Clearing existing production_locations...')
  const { error: delError } = await supabase
    .from('production_locations')
    .delete()
    .gte('production_id', 1)
  if (delError) {
    console.error('Delete error:', delError)
    return
  }

  console.log('Inserting new location rows...')
  await batchUpsert('production_locations', locationRows, 500)

  console.log(`Done! Migrated ${locationRows.length} location entries.`)

  // Show some samples
  const { data: samples } = await supabase
    .from('production_locations')
    .select('production_id, location, city, stage, country')
    .limit(15)
  console.log('\nSample entries:')
  for (const s of samples ?? []) {
    console.log(`  Production ${s.production_id}: ${s.location} [city=${s.city}, stage=${s.stage}, country=${s.country}]`)
  }
}

run().catch((e) => { console.error(e); process.exit(1) })
