/**
 * Migrate WordPress attachments/media to Supabase media table.
 * Records metadata only — actual file upload must be done separately
 * (see README for media upload instructions).
 */
import { mysql } from './db'
import { batchUpsert } from './supabase-admin'

const WP_UPLOAD_BASE = process.env.WP_UPLOAD_BASE ?? 'https://productionlist-wp-local.local/wp-content/uploads'

export async function runMediaMigration() {
  console.log('\n=== MEDIA MIGRATION ===')

  const attachments = mysql(`
    SELECT p.ID, p.post_title, p.post_name, p.guid, p.post_mime_type, p.post_date,
           pm.meta_value AS attached_file,
           pm2.meta_value AS alt_text
    FROM wp_posts p
    LEFT JOIN wp_postmeta pm ON pm.post_id = p.ID AND pm.meta_key = '_wp_attached_file'
    LEFT JOIN wp_postmeta pm2 ON pm2.post_id = p.ID AND pm2.meta_key = '_wp_attachment_image_alt'
    WHERE p.post_type = 'attachment'
    ORDER BY p.ID ASC
  `)

  console.log(`  Found ${attachments.length} attachments`)

  const rows = attachments.map((a) => ({
    id: parseInt(a.ID, 10),
    title: a.post_title || null,
    slug: a.post_name || null,
    mime_type: a.post_mime_type || null,
    file_path: a.attached_file || null,
    original_url: a.attached_file ? `${WP_UPLOAD_BASE}/${a.attached_file}` : (a.guid || null),
    alt_text: a.alt_text || null,
    created_at: a.post_date ? new Date(a.post_date).toISOString() : null,
    // storage_path will be set after actual file upload
    storage_path: null,
  }))

  await batchUpsert('media', rows, 500, 'id')

  console.log('\n✓ Media migration complete.')
  console.log('  NOTE: Run the separate media upload script to transfer files to Supabase Storage.')
}

if (require.main === module) {
  runMediaMigration().catch((e) => { console.error(e); process.exit(1) })
}
