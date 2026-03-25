#!/usr/bin/env node
/**
 * Import company staff associations from WordPress ACF repeater fields
 *
 * WP structure: staffs_N_staff = PHP serialized crew WP ID, staffs_N_position = text
 * Target: company_staff table (company_id, crew_id, position, sort_order)
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env.local') })

import { createClient } from '@supabase/supabase-js'
import mysql from 'mysql2/promise'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function extractWpId(phpSerialized) {
  if (!phpSerialized) return null
  // Handle: a:1:{i:0;s:5:"26787";}
  const match = phpSerialized.match(/s:\d+:"(\d+)"/)
  if (match) return parseInt(match[1], 10)
  // Handle plain number
  const num = parseInt(phpSerialized, 10)
  return isNaN(num) ? null : num
}

async function run() {
  console.log('Connecting to WordPress MySQL...')
  const conn = await mysql.createConnection({
    socketPath: '/Users/greysomething/Library/Application Support/Local/run/2W0rfPpDJ/mysql/mysqld.sock',
    user: 'root', password: 'root', database: 'local',
  })

  // Get all staff meta entries
  console.log('Fetching staff associations from WordPress...')
  const [staffRows] = await conn.execute(`
    SELECT p.ID as company_wp_id, pm.meta_key, pm.meta_value
    FROM wp_posts p
    JOIN wp_postmeta pm ON p.ID = pm.post_id
    WHERE p.post_type = 'production-contact' AND p.post_status = 'publish'
      AND pm.meta_key REGEXP '^staffs_[0-9]+_(staff|position)$'
      AND pm.meta_value != ''
    ORDER BY p.ID, pm.meta_key
  `)
  console.log(`Found ${staffRows.length} staff meta rows`)

  // Group by company_wp_id and index
  const companyStaff = new Map() // company_wp_id -> [{crew_wp_id, position, sort_order}]
  for (const row of staffRows) {
    const match = row.meta_key.match(/^staffs_(\d+)_(staff|position)$/)
    if (!match) continue
    const idx = parseInt(match[1], 10)
    const field = match[2]
    const key = `${row.company_wp_id}_${idx}`

    if (!companyStaff.has(key)) {
      companyStaff.set(key, { company_wp_id: row.company_wp_id, sort_order: idx })
    }
    const entry = companyStaff.get(key)
    if (field === 'staff') {
      entry.crew_wp_id = extractWpId(row.meta_value)
    } else if (field === 'position') {
      entry.position = row.meta_value
    }
  }

  const associations = [...companyStaff.values()].filter(a => a.crew_wp_id)
  console.log(`Parsed ${associations.length} valid staff associations`)

  // Build WP ID to Supabase ID maps
  console.log('Building ID maps...')

  // Companies: wp_id -> id
  const companyMap = new Map()
  let page = 0
  while (true) {
    const { data } = await sb.from('companies').select('id, wp_id').not('wp_id', 'is', null).range(page * 1000, page * 1000 + 999)
    if (!data || data.length === 0) break
    for (const c of data) companyMap.set(c.wp_id, c.id)
    if (data.length < 1000) break
    page++
  }
  console.log(`  ${companyMap.size} companies mapped`)

  // Crew: wp_id -> id
  const crewMap = new Map()
  page = 0
  while (true) {
    const { data } = await sb.from('crew_members').select('id, wp_id').not('wp_id', 'is', null).range(page * 1000, page * 1000 + 999)
    if (!data || data.length === 0) break
    for (const c of data) crewMap.set(c.wp_id, c.id)
    if (data.length < 1000) break
    page++
  }
  console.log(`  ${crewMap.size} crew members mapped`)

  // Insert into company_staff
  console.log('Importing staff associations...')
  let inserted = 0
  let skippedNoCompany = 0
  let skippedNoCrew = 0
  let errors = 0
  let batch = []

  for (let i = 0; i < associations.length; i++) {
    const a = associations[i]
    const companyId = companyMap.get(a.company_wp_id)
    if (!companyId) { skippedNoCompany++; continue }
    const crewId = crewMap.get(a.crew_wp_id)
    if (!crewId) { skippedNoCrew++; continue }

    batch.push({
      company_id: companyId,
      crew_id: crewId,
      position: a.position || null,
      sort_order: a.sort_order,
    })

    // Insert in batches of 100
    if (batch.length >= 100 || i === associations.length - 1) {
      const { error } = await sb.from('company_staff').upsert(batch, {
        onConflict: 'company_id,crew_id',
        ignoreDuplicates: true,
      })
      if (error) {
        // Try one by one
        for (const row of batch) {
          const { error: e2 } = await sb.from('company_staff').upsert(row, {
            onConflict: 'company_id,crew_id',
            ignoreDuplicates: true,
          })
          if (e2) {
            errors++
            if (errors <= 5) console.error(`  Error:`, e2.message)
          } else {
            inserted++
          }
        }
      } else {
        inserted += batch.length
      }
      batch = []
    }

    if ((i + 1) % 500 === 0) {
      console.log(`  Progress: ${i + 1}/${associations.length} (inserted: ${inserted}, errors: ${errors})`)
    }
  }

  console.log(`\n=== Company Staff Import Complete ===`)
  console.log(`Inserted: ${inserted}`)
  console.log(`Skipped (no company match): ${skippedNoCompany}`)
  console.log(`Skipped (no crew match): ${skippedNoCrew}`)
  console.log(`Errors: ${errors}`)

  await conn.end()
}

run().catch(console.error)
