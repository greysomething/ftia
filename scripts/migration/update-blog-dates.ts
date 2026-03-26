/**
 * Update blog_posts dates in Supabase from original WordPress dates.
 *
 * Sets published_at, wp_created_at, wp_updated_at from wp_posts.post_date / post_modified.
 */
import { mysql } from './db'
import { execSync } from 'child_process'

// 1. Fetch all published posts from WordPress
const wpRows = mysql(
  "SELECT ID, post_date, post_modified FROM wp_posts WHERE post_type='post' AND post_status='publish'"
)
console.log(`Found ${wpRows.length} published posts in WordPress`)

// 2. Build batched UPDATE SQL
// WordPress dates are in local time (no timezone), we treat them as UTC for Supabase
// Build CASE statements
const wpIds: string[] = []
const publishedCases: string[] = []
const createdCases: string[] = []
const updatedCases: string[] = []

for (const row of wpRows) {
  const id = row.ID
  // Convert "2016-08-20 03:31:42" to ISO format for timestamptz
  const postDate = row.post_date.replace(' ', 'T') + '+00:00'
  const postModified = row.post_modified.replace(' ', 'T') + '+00:00'

  wpIds.push(id)
  publishedCases.push(`WHEN ${id} THEN '${postDate}'::timestamptz`)
  createdCases.push(`WHEN ${id} THEN '${postDate}'::timestamptz`)
  updatedCases.push(`WHEN ${id} THEN '${postModified}'::timestamptz`)
}

// Batch in groups of 200 to avoid overly long SQL
const BATCH_SIZE = 200
let totalUpdated = 0

for (let i = 0; i < wpIds.length; i += BATCH_SIZE) {
  const batchIds = wpIds.slice(i, i + BATCH_SIZE)
  const batchPublished = publishedCases.slice(i, i + BATCH_SIZE)
  const batchCreated = createdCases.slice(i, i + BATCH_SIZE)
  const batchUpdated = updatedCases.slice(i, i + BATCH_SIZE)

  const idList = batchIds.join(', ')

  const sql = `UPDATE blog_posts SET
  published_at = CASE wp_id ${batchPublished.join(' ')} END,
  wp_created_at = CASE wp_id ${batchCreated.join(' ')} END,
  wp_updated_at = CASE wp_id ${batchUpdated.join(' ')} END
WHERE wp_id IN (${idList});`

  console.log(`Updating batch ${Math.floor(i / BATCH_SIZE) + 1} (${batchIds.length} posts, wp_ids ${batchIds[0]}..${batchIds[batchIds.length - 1]})...`)

  try {
    const result = execSync(
      `npx supabase db query --linked "${sql.replace(/"/g, '\\"')}"`,
      {
        cwd: '/Users/greysomething/Local Sites/productionlist-wp-local/nextjs-app',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 60000,
      }
    ).toString()
    console.log(`  Done.`)
    totalUpdated += batchIds.length
  } catch (err: any) {
    console.error(`  Error in batch: ${err.message}`)
  }
}

console.log(`\nTotal posts updated: ${totalUpdated}`)
