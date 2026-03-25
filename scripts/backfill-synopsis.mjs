#!/usr/bin/env node
/**
 * Backfill production synopsis (excerpt) from WordPress post_content
 *
 * 1. Copies WP post_content to Supabase content for productions missing it
 * 2. Generates clean plain-text excerpt from content for all productions
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env.local') })

import { createClient } from '@supabase/supabase-js'
import mysql from 'mysql2/promise'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\uFFFD/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function run() {
  // Connect to WP MySQL
  console.log('Connecting to WordPress MySQL...')
  const conn = await mysql.createConnection({
    socketPath: '/Users/greysomething/Library/Application Support/Local/run/2W0rfPpDJ/mysql/mysqld.sock',
    user: 'root',
    password: 'root',
    database: 'local',
  })

  // Step 1: Get all WP productions with content
  console.log('Fetching WordPress production content...')
  const [wpRows] = await conn.execute(`
    SELECT ID as wp_id, post_content, post_title
    FROM wp_posts
    WHERE post_type = 'production'
      AND post_status = 'publish'
      AND post_content != ''
      AND post_content IS NOT NULL
      AND CHAR_LENGTH(post_content) > 5
  `)
  console.log(`Found ${wpRows.length} WP productions with content`)

  // Build a map of wp_id -> content
  const wpContent = new Map()
  for (const row of wpRows) {
    wpContent.set(row.wp_id, row.post_content)
  }

  // Step 2: Get all Supabase productions
  console.log('Fetching Supabase productions...')
  let allProductions = []
  let page = 0
  while (true) {
    const { data, error } = await sb
      .from('productions')
      .select('id, wp_id, content, excerpt')
      .eq('visibility', 'publish')
      .range(page * 1000, page * 1000 + 999)
    if (error) { console.error('Error:', error); break }
    if (!data || data.length === 0) break
    allProductions.push(...data)
    if (data.length < 1000) break
    page++
  }
  console.log(`Found ${allProductions.length} Supabase productions`)

  // Step 3: Process
  let contentBackfilled = 0
  let excerptUpdated = 0
  let errors = 0
  let processed = 0

  for (const prod of allProductions) {
    processed++
    if (processed % 500 === 0) {
      console.log(`  Progress: ${processed}/${allProductions.length} (content: ${contentBackfilled}, excerpts: ${excerptUpdated}, errors: ${errors})`)
    }

    const updates = {}

    // Backfill content from WP if missing in Supabase
    if ((!prod.content || prod.content.trim() === '') && prod.wp_id && wpContent.has(prod.wp_id)) {
      updates.content = wpContent.get(prod.wp_id)
      contentBackfilled++
    }

    // Generate excerpt from content (use existing or newly backfilled)
    const rawContent = updates.content || prod.content || ''
    if (rawContent && (!prod.excerpt || prod.excerpt.trim() === '')) {
      const plainText = stripHtml(rawContent)
      if (plainText.length > 0) {
        // Truncate to ~500 chars at word boundary
        let excerpt = plainText
        if (excerpt.length > 500) {
          excerpt = excerpt.substring(0, 500)
          const lastSpace = excerpt.lastIndexOf(' ')
          if (lastSpace > 300) excerpt = excerpt.substring(0, lastSpace)
          excerpt += '...'
        }
        updates.excerpt = excerpt
        excerptUpdated++
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await sb
        .from('productions')
        .update(updates)
        .eq('id', prod.id)
      if (error) {
        errors++
        if (errors <= 5) console.error(`  Error updating id=${prod.id}:`, error.message)
      }
    }
  }

  console.log(`\n=== Synopsis Backfill Complete ===`)
  console.log(`Content backfilled from WP: ${contentBackfilled}`)
  console.log(`Excerpts generated: ${excerptUpdated}`)
  console.log(`Errors: ${errors}`)
  console.log(`Total processed: ${processed}`)

  await conn.end()
}

run().catch(console.error)
