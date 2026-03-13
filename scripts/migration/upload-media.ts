/**
 * Upload WordPress media files to Supabase Storage and update storage_path.
 *
 * Reads media records from Supabase, finds the corresponding local file
 * in the WP uploads directory, uploads to the "media" storage bucket,
 * and updates the storage_path column.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/migration/upload-media.ts
 *
 * Environment:
 *   WP_MEDIA_PATH  – path to WP uploads dir (default: Local WP path)
 */
import * as fs from 'fs'
import * as path from 'path'
import { supabase } from './supabase-admin'

const WP_MEDIA_PATH =
  process.env.WP_MEDIA_PATH ??
  '/Users/greysomething/Local Sites/productionlist-wp-local/app/public/wp-content/uploads'

const BUCKET = 'media'
const BATCH_SIZE = 20 // concurrent uploads per batch
const MIME_FALLBACK: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
}

function getMimeType(filePath: string, dbMime: string | null): string {
  if (dbMime) return dbMime
  const ext = path.extname(filePath).toLowerCase()
  return MIME_FALLBACK[ext] ?? 'application/octet-stream'
}

/**
 * Extract the relative WP upload path from original_url.
 * e.g. "https://productionlist-wp-local.local/wp-content/uploads/2024/01/photo.jpg"
 *    → "2024/01/photo.jpg"
 */
function extractRelPath(originalUrl: string): string | null {
  const marker = '/wp-content/uploads/'
  const idx = originalUrl.indexOf(marker)
  if (idx !== -1) {
    return originalUrl.substring(idx + marker.length)
  }
  // Fallback: try to find year/month pattern
  const match = originalUrl.match(/(\d{4}\/\d{2}\/.+)$/)
  return match ? match[1] : null
}

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some((b) => b.name === BUCKET)
  if (!exists) {
    console.log(`  Creating storage bucket "${BUCKET}"...`)
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 52428800, // 50MB
    })
    if (error) {
      // Ignore "already exists" errors
      if (!error.message?.includes('already exists')) {
        throw new Error(`Failed to create bucket: ${error.message}`)
      }
    }
    console.log(`  ✓ Bucket "${BUCKET}" created`)
  } else {
    console.log(`  ✓ Bucket "${BUCKET}" already exists`)
  }
}

async function fetchMediaRecords() {
  const allRecords: any[] = []
  let from = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('media')
      .select('id, original_url, mime_type, storage_path')
      .is('storage_path', null) // only records not yet uploaded
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw error
    if (!data || data.length === 0) break
    allRecords.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  return allRecords
}

async function uploadFile(
  record: { id: number; original_url: string; mime_type: string | null }
): Promise<{ id: number; storagePath: string } | null> {
  if (!record.original_url) return null

  const relPath = extractRelPath(record.original_url)
  if (!relPath) return null

  const localPath = path.join(WP_MEDIA_PATH, relPath)

  if (!fs.existsSync(localPath)) {
    return null
  }

  const fileBuffer = fs.readFileSync(localPath)
  const storagePath = relPath // preserve year/month structure
  const contentType = getMimeType(localPath, record.mime_type)

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType,
      upsert: true,
    })

  if (error) {
    // Skip non-critical errors
    if (error.message?.includes('already exists')) {
      return { id: record.id, storagePath }
    }
    console.error(`  ✗ Upload failed for ${relPath}: ${error.message}`)
    return null
  }

  return { id: record.id, storagePath }
}

async function updateStoragePaths(updates: { id: number; storagePath: string }[]) {
  for (const u of updates) {
    const { error } = await supabase
      .from('media')
      .update({ storage_path: u.storagePath })
      .eq('id', u.id)

    if (error) {
      console.error(`  ✗ Failed to update media ${u.id}: ${error.message}`)
    }
  }
}

async function run() {
  console.log('\n=== MEDIA FILE UPLOAD ===')
  console.log(`  Source: ${WP_MEDIA_PATH}`)

  await ensureBucket()

  const records = await fetchMediaRecords()
  console.log(`  Found ${records.length} media records without storage_path`)

  if (records.length === 0) {
    console.log('  Nothing to upload.')
    return
  }

  let uploaded = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(batch.map(uploadFile))

    const successful = results.filter((r): r is { id: number; storagePath: string } => r !== null)
    const failedInBatch = results.filter((r) => r === null).length

    if (successful.length > 0) {
      await updateStoragePaths(successful)
    }

    uploaded += successful.length
    skipped += failedInBatch
    failed += batch.length - successful.length - failedInBatch

    const total = Math.min(i + BATCH_SIZE, records.length)
    process.stdout.write(
      `  Progress: ${total}/${records.length} (${uploaded} uploaded, ${skipped + failed} skipped)\r`
    )
  }

  console.log(`\n\n✓ Media upload complete.`)
  console.log(`  Uploaded: ${uploaded}`)
  console.log(`  Skipped (file not found / failed): ${skipped + failed}`)
}

run().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})
