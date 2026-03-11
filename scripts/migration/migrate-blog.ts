/**
 * Migrate WordPress posts (blog) → Supabase blog_posts table.
 * Also migrates blog_post_categories and blog_post_tags.
 */
import { mysql } from './db'
import { batchUpsert } from './supabase-admin'

export async function runBlogMigration() {
  console.log('\n=== BLOG POSTS MIGRATION ===')

  const posts = mysql(`
    SELECT p.ID, p.post_title, p.post_name, p.post_content, p.post_excerpt,
           p.post_status, p.post_date, p.post_modified, p.post_author,
           pm.meta_value AS thumbnail_id
    FROM wp_posts p
    LEFT JOIN wp_postmeta pm ON pm.post_id = p.ID AND pm.meta_key = '_thumbnail_id'
    WHERE p.post_type = 'post'
      AND p.post_status IN ('publish', 'draft', 'future', 'private')
    ORDER BY p.ID ASC
  `)

  console.log(`  Found ${posts.length} blog posts`)

  // Category links
  const catLinks = mysql(`
    SELECT p.ID as post_id, t.term_id
    FROM wp_posts p
    JOIN wp_term_relationships tr ON tr.object_id = p.ID
    JOIN wp_term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
      AND tt.taxonomy = 'category'
    JOIN wp_terms t ON t.term_id = tt.term_id
    WHERE p.post_type = 'post' AND p.post_status IN ('publish', 'draft', 'future', 'private')
  `)

  // Tag links
  const tagLinks = mysql(`
    SELECT p.ID as post_id, t.term_id
    FROM wp_posts p
    JOIN wp_term_relationships tr ON tr.object_id = p.ID
    JOIN wp_term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
      AND tt.taxonomy = 'post_tag'
    JOIN wp_terms t ON t.term_id = tt.term_id
    WHERE p.post_type = 'post' AND p.post_status IN ('publish', 'draft', 'future', 'private')
  `)

  const postRows = posts.map((p) => ({
    id: parseInt(p.ID, 10),
    title: p.post_title,
    slug: p.post_name,
    content: p.post_content || null,
    excerpt: p.post_excerpt || null,
    status: p.post_status === 'publish' ? 'published'
      : p.post_status === 'draft' ? 'draft'
      : p.post_status === 'future' ? 'scheduled'
      : 'draft',
    thumbnail_id: p.thumbnail_id ? parseInt(p.thumbnail_id, 10) : null,
    wp_id: parseInt(p.ID, 10),
    published_at: p.post_status === 'publish' && p.post_date
      ? new Date(p.post_date).toISOString()
      : null,
    created_at: p.post_date ? new Date(p.post_date).toISOString() : null,
    updated_at: p.post_modified ? new Date(p.post_modified).toISOString() : null,
  }))

  await batchUpsert('blog_posts', postRows, 200, 'id')

  const catRows = catLinks.map((r) => ({
    blog_post_id: parseInt(r.post_id, 10),
    category_id: parseInt(r.term_id, 10),
  }))
  if (catRows.length > 0) await batchUpsert('blog_post_categories', catRows, 500)

  const tagRows = tagLinks.map((r) => ({
    blog_post_id: parseInt(r.post_id, 10),
    tag_id: parseInt(r.term_id, 10),
  }))
  if (tagRows.length > 0) await batchUpsert('blog_post_tags', tagRows, 500)

  console.log('\n✓ Blog migration complete.')
}

if (require.main === module) {
  runBlogMigration().catch((e) => { console.error(e); process.exit(1) })
}
