/**
 * Link thumbnail_ids from WordPress featured images to Supabase content tables.
 *
 * After media records are imported, this script reads _thumbnail_id postmeta
 * from WordPress and updates the corresponding rows in productions, companies,
 * blog_posts, and pages.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/migration/link-thumbnails.ts
 */
import { mysql } from './db'
import { supabase } from './supabase-admin'

interface ThumbnailMapping {
  post_id: number
  thumbnail_id: number
}

function fetchThumbnailMappings(): ThumbnailMapping[] {
  const rows = mysql(`
    SELECT pm.post_id, pm.meta_value AS thumbnail_id
    FROM wp_postmeta pm
    INNER JOIN wp_posts p ON p.ID = pm.post_id
    WHERE pm.meta_key = '_thumbnail_id'
      AND pm.meta_value IS NOT NULL
      AND pm.meta_value != ''
      AND pm.meta_value != '0'
    ORDER BY pm.post_id ASC
  `)

  return rows
    .map((r) => ({
      post_id: parseInt(r.post_id, 10),
      thumbnail_id: parseInt(r.thumbnail_id, 10),
    }))
    .filter((r) => !isNaN(r.post_id) && !isNaN(r.thumbnail_id) && r.thumbnail_id > 0)
}

async function fetchValidMediaIds(): Promise<Set<number>> {
  const ids = new Set<number>()
  let from = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('media')
      .select('id')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw error
    if (!data || data.length === 0) break
    for (const row of data) ids.add(row.id)
    if (data.length < pageSize) break
    from += pageSize
  }

  return ids
}

async function fetchTableIds(table: string): Promise<Set<number>> {
  const ids = new Set<number>()
  let from = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw error
    if (!data || data.length === 0) break
    for (const row of data) ids.add(row.id)
    if (data.length < pageSize) break
    from += pageSize
  }

  return ids
}

async function updateThumbnails(
  table: string,
  tableIds: Set<number>,
  mediaIds: Set<number>,
  mappings: ThumbnailMapping[]
) {
  const applicable = mappings.filter(
    (m) => tableIds.has(m.post_id) && mediaIds.has(m.thumbnail_id)
  )

  if (applicable.length === 0) {
    console.log(`  ${table}: 0 thumbnails to link`)
    return
  }

  let updated = 0
  let errors = 0

  for (const m of applicable) {
    const { error } = await supabase
      .from(table)
      .update({ thumbnail_id: m.thumbnail_id })
      .eq('id', m.post_id)

    if (error) {
      errors++
    } else {
      updated++
    }
  }

  console.log(`  ${table}: ${updated} thumbnails linked (${errors} errors)`)
}

async function run() {
  console.log('\n=== LINK THUMBNAIL IDS ===')

  // 1. Get all WordPress thumbnail mappings
  const mappings = fetchThumbnailMappings()
  console.log(`  Found ${mappings.length} thumbnail mappings in WordPress`)

  // 2. Get valid media IDs
  const mediaIds = await fetchValidMediaIds()
  console.log(`  Found ${mediaIds.size} valid media records`)

  // 3. Process each content table
  const tables = ['productions', 'companies', 'blog_posts', 'pages']

  for (const table of tables) {
    const tableIds = await fetchTableIds(table)
    await updateThumbnails(table, tableIds, mediaIds, mappings)
  }

  console.log('\n✓ Thumbnail linking complete.')
}

run().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})
