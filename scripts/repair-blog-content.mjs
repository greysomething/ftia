#!/usr/bin/env node
/**
 * Repair blog post content and thumbnails.
 *
 * Issues fixed:
 * 1. Blog content was truncated during migration (TSV parsing broke on newlines)
 * 2. thumbnail_id was not linked (link-thumbnails.ts never ran or failed)
 * 3. Image URLs in content point to productionlist.com/wp-content/uploads — kept as-is
 *    since they resolve on the live domain
 *
 * This script reads directly from WordPress MySQL using JSON output to avoid
 * the TSV newline parsing issue, then updates Supabase.
 */

import { execSync } from 'child_process'
import { createClient } from '@supabase/supabase-js'

// ── Config ──────────────────────────────────────────────
const MYSQL_BIN = process.env.MYSQL_BIN ??
  '/Users/greysomething/Library/Application Support/Local/lightning-services/mysql-8.0.35+4/bin/darwin/bin/mysql'
const MYSQL_SOCKET = process.env.MYSQL_SOCKET ??
  '/Users/greysomething/Library/Application Support/Local/run/2W0rfPpDJ/mysql/mysqld.sock'
const MYSQL_DB = 'local'

const SUPABASE_URL = 'https://ynwdhnlnawemmxjrtgyy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlud2RobmxuYXdlbW14anJ0Z3l5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzIxMTI3MiwiZXhwIjoyMDg4Nzg3MjcyfQ.ukhyOJUIH_Y6IHJVpXnsqNMvX_o4FojGcOfY-HKrzko'

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── MySQL helper using XML output (handles newlines in content) ─
function mysqlXml(sql) {
  const escaped = sql.replace(/'/g, `'\\''`)
  const cmd = `"${MYSQL_BIN}" -uroot -proot --protocol=socket -S "${MYSQL_SOCKET}" --default-character-set=utf8mb4 ${MYSQL_DB} --xml -e '${escaped}'`

  const cleanEnv = { ...process.env }
  delete cleanEnv.MYSQL_HOST
  delete cleanEnv.MYSQL_TCP_PORT

  const out = execSync(cmd, { maxBuffer: 512 * 1024 * 1024, env: cleanEnv }).toString()
  return parseXmlRows(out)
}

function parseXmlRows(xml) {
  const rows = []
  // Match each <row>...</row>
  const rowRegex = /<row>([\s\S]*?)<\/row>/g
  let match
  while ((match = rowRegex.exec(xml)) !== null) {
    const row = {}
    // Match each <field name="...">...</field> or <field name="..." xsi:nil="true" />
    const fieldRegex = /<field name="([^"]+)"(?:\s+xsi:nil="true"\s*\/>|>([\s\S]*?)<\/field>)/g
    let fMatch
    while ((fMatch = fieldRegex.exec(match[1])) !== null) {
      const name = fMatch[1]
      const value = fMatch[2] !== undefined ? fMatch[2] : null
      // Decode XML entities
      row[name] = value !== null ? value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        : null
    }
    rows.push(row)
  }
  return rows
}

// ── Main ────────────────────────────────────────────────
async function main() {
  console.log('=== REPAIR BLOG CONTENT & THUMBNAILS ===\n')

  // 1. Get all published blog posts from WordPress with full content + thumbnail
  console.log('Fetching blog posts from WordPress...')
  const wpPosts = mysqlXml(`
    SELECT p.ID, p.post_title, p.post_name, p.post_content, p.post_excerpt,
           p.post_status, p.post_date, p.post_modified, p.post_author,
           pm.meta_value AS thumbnail_id
    FROM wp_posts p
    LEFT JOIN wp_postmeta pm ON pm.post_id = p.ID AND pm.meta_key = '_thumbnail_id'
    WHERE p.post_type = 'post'
      AND p.post_status IN ('publish', 'draft', 'future', 'private')
    ORDER BY p.ID ASC
  `)
  console.log(`  Found ${wpPosts.length} blog posts in WordPress`)

  // 2. Get existing blog posts from Supabase to compare
  console.log('Fetching existing blog posts from Supabase...')
  let supabasePosts = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('blog_posts')
      .select('id, thumbnail_id')
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    supabasePosts.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  const existingIds = new Set(supabasePosts.map(p => p.id))
  console.log(`  Found ${supabasePosts.length} blog posts in Supabase`)

  // 3. Get valid media IDs from Supabase (for thumbnail linking)
  console.log('Fetching media IDs from Supabase...')
  const mediaIds = new Set()
  from = 0
  while (true) {
    const { data, error } = await sb
      .from('media')
      .select('id')
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const m of data) mediaIds.add(m.id)
    if (data.length < 1000) break
    from += 1000
  }
  console.log(`  Found ${mediaIds.size} media records`)

  // 4. Process updates
  let contentUpdated = 0
  let thumbnailsLinked = 0
  let contentErrors = 0
  let skipped = 0

  const total = wpPosts.length
  for (let i = 0; i < total; i++) {
    const wp = wpPosts[i]
    const wpId = parseInt(wp.ID, 10)
    if (isNaN(wpId) || !existingIds.has(wpId)) {
      skipped++
      continue
    }

    const updates = {}
    let needsUpdate = false

    // Fix content — always overwrite with full WordPress content
    const wpContent = wp.post_content || null
    if (wpContent && wpContent.length > 0) {
      // Rewrite local WP URLs to production URLs
      const fixedContent = wpContent
        .replace(/https?:\/\/productionlist-wp-local\.local\/wp-content\/uploads/g,
          'https://productionlist.com/wp-content/uploads')
      updates.content = fixedContent
      needsUpdate = true
    }

    // Fix thumbnail_id
    const thumbId = wp.thumbnail_id ? parseInt(wp.thumbnail_id, 10) : null
    if (thumbId && !isNaN(thumbId) && mediaIds.has(thumbId)) {
      updates.thumbnail_id = thumbId
      thumbnailsLinked++
    } else if (thumbId && !isNaN(thumbId) && !mediaIds.has(thumbId)) {
      // Media record doesn't exist in Supabase — create a stub
      // so the FK constraint doesn't fail
      // We'll need to know the file path for this
    }

    if (needsUpdate) {
      const { error } = await sb
        .from('blog_posts')
        .update(updates)
        .eq('id', wpId)

      if (error) {
        contentErrors++
        if (contentErrors <= 5) {
          console.error(`  Error updating post ${wpId}: ${error.message}`)
        }
      } else {
        contentUpdated++
      }
    }

    if ((i + 1) % 100 === 0 || i === total - 1) {
      process.stdout.write(`\r  Progress: ${i + 1}/${total} posts processed`)
    }
  }

  console.log('\n')
  console.log(`  Content updated: ${contentUpdated}`)
  console.log(`  Thumbnails linked: ${thumbnailsLinked}`)
  console.log(`  Errors: ${contentErrors}`)
  console.log(`  Skipped (not in Supabase): ${skipped}`)

  // 5. Handle thumbnail_ids where media doesn't exist in Supabase
  // Check how many posts have thumbnails pointing to missing media
  console.log('\n--- Checking for missing media records needed for thumbnails ---')
  const missingMedia = []
  for (const wp of wpPosts) {
    const wpId = parseInt(wp.ID, 10)
    const thumbId = wp.thumbnail_id ? parseInt(wp.thumbnail_id, 10) : null
    if (thumbId && !isNaN(thumbId) && !mediaIds.has(thumbId) && existingIds.has(wpId)) {
      missingMedia.push(thumbId)
    }
  }
  console.log(`  ${missingMedia.length} blog posts have thumbnails pointing to missing media`)

  if (missingMedia.length > 0) {
    // Fetch these media records from WordPress and create them
    const uniqueMediaIds = [...new Set(missingMedia)]
    console.log(`  Creating ${uniqueMediaIds.length} missing media records...`)

    // Fetch in batches
    const batchSize = 50
    let mediaCreated = 0
    for (let i = 0; i < uniqueMediaIds.length; i += batchSize) {
      const batch = uniqueMediaIds.slice(i, i + batchSize)
      const idList = batch.join(',')
      const mediaRows = mysqlXml(`
        SELECT p.ID, p.post_title, p.post_name, p.guid, p.post_mime_type,
               pm.meta_value AS attached_file,
               pm2.meta_value AS alt_text
        FROM wp_posts p
        LEFT JOIN wp_postmeta pm ON pm.post_id = p.ID AND pm.meta_key = '_wp_attached_file'
        LEFT JOIN wp_postmeta pm2 ON pm2.post_id = p.ID AND pm2.meta_key = '_wp_attachment_image_alt'
        WHERE p.ID IN (${idList})
      `)

      const inserts = mediaRows.map(a => {
        const attachedFile = a.attached_file || null
        const filename = attachedFile
          ? attachedFile.split('/').pop() || attachedFile
          : (a.post_name || 'unknown')

        return {
          id: parseInt(a.ID, 10),
          wp_id: parseInt(a.ID, 10),
          title: a.post_title || null,
          filename,
          mime_type: a.post_mime_type || null,
          original_url: attachedFile
            ? `https://productionlist.com/wp-content/uploads/${attachedFile}`
            : (a.guid || null),
          alt_text: a.alt_text || null,
          storage_path: attachedFile || null,
        }
      }).filter(r => r.id && !isNaN(r.id))

      if (inserts.length > 0) {
        const { error } = await sb
          .from('media')
          .upsert(inserts, { onConflict: 'id' })
        if (error) {
          console.error(`  Error creating media batch: ${error.message}`)
        } else {
          mediaCreated += inserts.length
        }
      }
    }
    console.log(`  Created ${mediaCreated} media records`)

    // Now link the thumbnails
    console.log('  Linking thumbnails for previously missing media...')
    let linkedExtra = 0
    for (const wp of wpPosts) {
      const wpId = parseInt(wp.ID, 10)
      const thumbId = wp.thumbnail_id ? parseInt(wp.thumbnail_id, 10) : null
      if (thumbId && !isNaN(thumbId) && !mediaIds.has(thumbId) && existingIds.has(wpId)) {
        const { error } = await sb
          .from('blog_posts')
          .update({ thumbnail_id: thumbId })
          .eq('id', wpId)
        if (!error) linkedExtra++
      }
    }
    console.log(`  Linked ${linkedExtra} additional thumbnails`)
  }

  console.log('\n✓ Blog content & thumbnail repair complete.')
}

main().catch(e => {
  console.error('Fatal error:', e)
  process.exit(1)
})
