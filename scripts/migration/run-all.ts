/**
 * Master migration runner.
 * Runs all migration steps in the correct dependency order.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/migration/run-all.ts
 *
 * Prerequisites:
 *   1. Local WP running (MySQL must be accessible)
 *   2. .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   3. Supabase schema applied (supabase-schema.sql run in Supabase SQL editor)
 */
import { runTaxonomyMigration } from './migrate-taxonomy'
import { runMediaMigration } from './migrate-media'
import { runProductionsMigration } from './migrate-productions'
import { runContactsMigration } from './migrate-contacts'
import { runCrewMigration } from './migrate-crew'
import { runRelationsMigration } from './migrate-relations'
import { runBlogMigration } from './migrate-blog'
import { runPagesMigration } from './migrate-pages'
import { runUsersMigration } from './migrate-users'
import { runMembershipsMigration } from './migrate-memberships'

async function main() {
  const start = Date.now()
  console.log('╔════════════════════════════════════════╗')
  console.log('║   Production List – Full Migration     ║')
  console.log('╚════════════════════════════════════════╝')
  console.log(`  Started: ${new Date().toISOString()}`)

  const steps: Array<{ name: string; fn: () => Promise<void> }> = [
    // Step 1: Taxonomy (no dependencies)
    { name: 'Taxonomy', fn: runTaxonomyMigration },

    // Step 2: Media (no dependencies)
    { name: 'Media', fn: runMediaMigration },

    // Step 3: Core content (depends on taxonomy)
    { name: 'Productions', fn: runProductionsMigration },
    { name: 'Companies', fn: runContactsMigration },
    { name: 'Crew Members', fn: runCrewMigration },

    // Step 4: Blog & Pages
    { name: 'Blog Posts', fn: runBlogMigration },
    { name: 'Pages', fn: runPagesMigration },

    // Step 5: Relations (depends on productions + companies + crew)
    { name: 'Relations', fn: runRelationsMigration },

    // Step 6: Users (can run independently)
    { name: 'Users', fn: runUsersMigration },

    // Step 7: Memberships (depends on users)
    { name: 'Memberships', fn: runMembershipsMigration },
  ]

  const args = process.argv.slice(2)
  const only = args.find((a) => a.startsWith('--only='))?.replace('--only=', '')
  const skip = args.find((a) => a.startsWith('--skip='))?.replace('--skip=', '')?.split(',')

  const filtered = steps.filter((s) => {
    if (only) return s.name.toLowerCase() === only.toLowerCase()
    if (skip) return !skip.some((sk) => sk.toLowerCase() === s.name.toLowerCase())
    return true
  })

  const errors: string[] = []

  for (const step of filtered) {
    const stepStart = Date.now()
    console.log(`\n${'─'.repeat(50)}`)
    console.log(`Running: ${step.name}`)
    try {
      await step.fn()
      const elapsed = ((Date.now() - stepStart) / 1000).toFixed(1)
      console.log(`  ✓ ${step.name} completed in ${elapsed}s`)
    } catch (err: any) {
      console.error(`  ✗ ${step.name} FAILED:`, err.message)
      errors.push(step.name)
      if (!args.includes('--continue-on-error')) {
        console.error('\nMigration aborted. Fix the error and rerun.')
        console.error('Use --continue-on-error to skip failed steps.')
        process.exit(1)
      }
    }
  }

  const totalElapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log('\n╔════════════════════════════════════════╗')
  if (errors.length === 0) {
    console.log(`║   ✓ Migration complete in ${totalElapsed}s         ║`)
  } else {
    console.log(`║   ⚠ Migration done with ${errors.length} error(s)      ║`)
    console.log(`║   Failed: ${errors.join(', ')}`)
  }
  console.log('╚════════════════════════════════════════╝')
}

main().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})
