/**
 * Migrate WordPress pages → Supabase pages table.
 */
import { mysql } from './db'
import { batchUpsert } from './supabase-admin'

function safeDate(val: string | null | undefined): string | null {
  if (!val || val.startsWith('0000')) return null
  try {
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d.toISOString()
  } catch { return null }
}

export async function runPagesMigration() {
  console.log('\n=== PAGES MIGRATION ===')

  const posts = mysql(`
    SELECT p.ID, p.post_title, p.post_name, p.post_content, p.post_excerpt,
           p.post_status, p.post_date, p.post_modified, p.post_parent, p.menu_order,
           pm.meta_value AS thumbnail_id
    FROM wp_posts p
    LEFT JOIN wp_postmeta pm ON pm.post_id = p.ID AND pm.meta_key = '_thumbnail_id'
    WHERE p.post_type = 'page'
      AND p.post_status IN ('publish', 'draft', 'private')
    ORDER BY p.ID ASC
  `)

  console.log(`  Found ${posts.length} pages`)

  const pageRows = posts.map((p) => ({
    id: parseInt(p.ID, 10),
    wp_id: parseInt(p.ID, 10),
    title: p.post_title,
    slug: p.post_name,
    content: p.post_content || null,
    excerpt: p.post_excerpt || null,
    visibility: p.post_status === 'publish' ? 'publish'
      : p.post_status === 'private' ? 'private' : 'draft',
    parent_id: p.post_parent && p.post_parent !== '0' ? parseInt(p.post_parent, 10) : null,
    thumbnail_id: null, // set to null initially; linked after media migration
    menu_order: p.menu_order ? parseInt(p.menu_order, 10) : 0,
    wp_created_at: safeDate(p.post_date),
    wp_updated_at: safeDate(p.post_modified),
  })).filter(r => r.id && !isNaN(r.id) && r.title && r.slug)

  // Deduplicate by slug+parent_id combo (unique constraint)
  const seenKeys = new Set<string>()
  const dedupedRows = pageRows.filter(r => {
    const key = `${r.slug}::${r.parent_id ?? 'null'}`
    if (seenKeys.has(key)) return false
    seenKeys.add(key)
    return true
  })
  console.log(`  Filtered: ${posts.length} → ${dedupedRows.length} valid rows`)

  await batchUpsert('pages', dedupedRows, 200, 'id')

  console.log('\n✓ Pages migration complete.')
}

if (require.main === module) {
  runPagesMigration().catch((e) => { console.error(e); process.exit(1) })
}
