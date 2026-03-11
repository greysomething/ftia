/**
 * Migrate WordPress taxonomies to Supabase.
 * Handles: production-type, production-union, production-rcat, production-ccat,
 *          category, post_tag
 */
import { mysql } from './db'
import { supabase, batchUpsert } from './supabase-admin'

const TABLE_MAP: Record<string, string> = {
  'production-type': 'production_types',
  'production-union': 'production_statuses',
  'production-rcat': 'role_categories',
  'production-ccat': 'company_categories',
  'category': 'blog_categories',
  'post_tag': 'blog_tags',
}

async function migrateTaxonomy(taxonomy: string, targetTable: string) {
  console.log(`\n→ Migrating ${taxonomy} → ${targetTable}`)

  const rows = mysql(`
    SELECT t.term_id, t.name, t.slug, tt.description, tt.count, tt.parent
    FROM wp_terms t
    JOIN wp_term_taxonomy tt ON tt.term_id = t.term_id
    WHERE tt.taxonomy = '${taxonomy}'
    ORDER BY t.term_id ASC
  `)

  if (rows.length === 0) {
    console.log(`  No terms found for ${taxonomy}`)
    return
  }

  const upsertRows = rows.map((r) => ({
    id: parseInt(r.term_id, 10),
    name: r.name,
    slug: r.slug,
    description: r.description || null,
    parent_id: r.parent && r.parent !== '0' ? parseInt(r.parent, 10) : null,
  }))

  await batchUpsert(targetTable, upsertRows, 500, 'id')
}

export async function runTaxonomyMigration() {
  console.log('\n=== TAXONOMY MIGRATION ===')
  for (const [taxonomy, table] of Object.entries(TABLE_MAP)) {
    await migrateTaxonomy(taxonomy, table)
  }
  console.log('\n✓ Taxonomy migration complete.')
}

if (require.main === module) {
  runTaxonomyMigration().catch((e) => { console.error(e); process.exit(1) })
}
