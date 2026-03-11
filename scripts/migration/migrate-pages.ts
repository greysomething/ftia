/**
 * Migrate WordPress pages → Supabase pages table.
 */
import { mysql } from './db'
import { batchUpsert } from './supabase-admin'

export async function runPagesMigration() {
  console.log('\n=== PAGES MIGRATION ===')

  const posts = mysql(`
    SELECT p.ID, p.post_title, p.post_name, p.post_content, p.post_excerpt,
           p.post_status, p.post_date, p.post_modified, p.post_parent,
           pm.meta_value AS thumbnail_id,
           pm2.meta_value AS yoast_title,
           pm3.meta_value AS yoast_desc
    FROM wp_posts p
    LEFT JOIN wp_postmeta pm ON pm.post_id = p.ID AND pm.meta_key = '_thumbnail_id'
    LEFT JOIN wp_postmeta pm2 ON pm2.post_id = p.ID AND pm2.meta_key = '_yoast_wpseo_title'
    LEFT JOIN wp_postmeta pm3 ON pm3.post_id = p.ID AND pm3.meta_key = '_yoast_wpseo_metadesc'
    WHERE p.post_type = 'page'
      AND p.post_status IN ('publish', 'draft', 'private')
    ORDER BY p.ID ASC
  `)

  console.log(`  Found ${posts.length} pages`)

  const pageRows = posts.map((p) => {
    // Build slug: if has parent, try to reconstruct path
    // For simplicity use post_name directly (parent nesting handled by hierarchy display)
    return {
      id: parseInt(p.ID, 10),
      title: p.post_title,
      slug: p.post_name,
      content: p.post_content || null,
      excerpt: p.post_excerpt || null,
      visibility: p.post_status === 'publish' ? 'public'
        : p.post_status === 'private' ? 'members_only' : 'draft',
      seo_title: p.yoast_title || null,
      seo_description: p.yoast_desc || null,
      parent_id: p.post_parent && p.post_parent !== '0' ? parseInt(p.post_parent, 10) : null,
      thumbnail_id: p.thumbnail_id ? parseInt(p.thumbnail_id, 10) : null,
      wp_id: parseInt(p.ID, 10),
      created_at: p.post_date ? new Date(p.post_date).toISOString() : null,
      updated_at: p.post_modified ? new Date(p.post_modified).toISOString() : null,
    }
  })

  await batchUpsert('pages', pageRows, 200, 'id')

  console.log('\n✓ Pages migration complete.')
}

if (require.main === module) {
  runPagesMigration().catch((e) => { console.error(e); process.exit(1) })
}
