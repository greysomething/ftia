/**
 * Supabase admin client for migration scripts.
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local'
  )
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
})

/** Upsert in batches to avoid request size limits */
export async function batchUpsert(
  table: string,
  rows: any[],
  batchSize = 500,
  onConflict?: string
) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const query = supabase.from(table).upsert(batch, onConflict ? { onConflict } : undefined)
    const { error } = await query
    if (error) {
      console.error(`Error upserting into ${table} (batch ${i / batchSize}):`, error)
      throw error
    }
    process.stdout.write(`  ${table}: ${Math.min(i + batchSize, rows.length)}/${rows.length}\r`)
  }
  console.log(`  ${table}: ${rows.length} rows upserted.`)
}
