/**
 * Repair script: Re-parse _raw_contact and _raw_roles from Supabase
 * and recreate production_company_links and production_crew_roles.
 *
 * The original migration missed ~95% of productions because PHP arrays
 * with mixed keys (string + integer) were not properly iterated.
 *
 * Run: node scripts/repair-relations.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── PHP Serialization Parser ──────────────────────────────────────
// Minimal parser for PHP serialize() format — handles the common types
function phpUnserialize(str) {
  let pos = 0

  function read() {
    const type = str[pos]
    if (type === 'N') {
      // null: N;
      pos += 2 // N;
      return null
    }
    if (type === 'b') {
      // bool: b:0; or b:1;
      pos += 2 // b:
      const val = str[pos] === '1'
      pos += 2 // 1;
      return val
    }
    if (type === 'i') {
      // int: i:123;
      pos += 2 // i:
      const end = str.indexOf(';', pos)
      const val = parseInt(str.substring(pos, end), 10)
      pos = end + 1
      return val
    }
    if (type === 'd') {
      // float: d:1.5;
      pos += 2 // d:
      const end = str.indexOf(';', pos)
      const val = parseFloat(str.substring(pos, end))
      pos = end + 1
      return val
    }
    if (type === 's') {
      // string: s:5:"hello";
      pos += 2 // s:
      const lenEnd = str.indexOf(':', pos)
      const len = parseInt(str.substring(pos, lenEnd), 10)
      pos = lenEnd + 2 // :"
      const val = str.substring(pos, pos + len)
      pos += len + 2 // ";
      return val
    }
    if (type === 'a') {
      // array: a:3:{...}
      pos += 2 // a:
      const lenEnd = str.indexOf(':', pos)
      const count = parseInt(str.substring(pos, lenEnd), 10)
      pos = lenEnd + 2 // :{
      const result = {}
      let allIntKeys = true
      let maxKey = -1
      for (let i = 0; i < count; i++) {
        const key = read()
        const value = read()
        result[key] = value
        if (typeof key !== 'number') allIntKeys = false
        else maxKey = Math.max(maxKey, key)
      }
      pos += 1 // }
      // Convert to array if all keys are sequential integers starting from 0
      if (allIntKeys && count > 0 && maxKey === count - 1) {
        const arr = []
        for (let i = 0; i < count; i++) arr.push(result[i])
        return arr
      }
      return result
    }
    // Skip unknown types
    const semi = str.indexOf(';', pos)
    if (semi !== -1) {
      pos = semi + 1
      return null
    }
    throw new Error(`Unknown type '${type}' at position ${pos} in: ${str.substring(pos, pos + 50)}`)
  }

  try {
    return read()
  } catch {
    return null
  }
}

/** Try to deserialize, handling double-serialization and JSON wrapping */
function parseRawField(raw) {
  if (!raw) return null

  let str = raw
  // The _raw_ field may be JSON-stringified (extra quotes)
  if (typeof str === 'string' && str.startsWith('"') && str.endsWith('"')) {
    try {
      str = JSON.parse(str)
    } catch {}
  }
  // May be double-JSON-stringified
  if (typeof str === 'string' && str.startsWith('"') && str.endsWith('"')) {
    try {
      str = JSON.parse(str)
    } catch {}
  }

  if (typeof str !== 'string') return str

  // Now try PHP unserialize
  let result = phpUnserialize(str)

  // Handle double-serialization: result is a string containing PHP serialized data
  if (typeof result === 'string' && /^[abisNd][:;]/.test(result)) {
    const inner = phpUnserialize(result)
    if (inner !== null) result = inner
  }

  return result
}

/** Convert parsed object/array to flat array of entries */
function toEntries(parsed) {
  if (!parsed) return []
  if (Array.isArray(parsed)) return parsed.filter(Boolean)
  if (typeof parsed === 'object') return Object.values(parsed).filter(Boolean)
  return []
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('=== RELATION REPAIR SCRIPT ===\n')

  // Fetch all productions with raw data
  console.log('Fetching productions with raw contact/roles data...')
  const allProductions = []
  let offset = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('productions')
      .select('id, wp_id, _raw_contact, _raw_roles')
      .not('_raw_contact', 'is', null)
      .range(offset, offset + pageSize - 1)
    if (error) { console.error('Fetch error:', error); break }
    if (!data || data.length === 0) break
    allProductions.push(...data)
    offset += pageSize
    if (data.length < pageSize) break
  }
  console.log(`  Loaded ${allProductions.length} productions with raw data`)

  // Fetch valid IDs
  const { data: validCompanies } = await supabase.from('companies').select('id, wp_id')
  const companyByWpId = new Map()
  const validCompanyIds = new Set()
  for (const c of (validCompanies ?? [])) {
    validCompanyIds.add(c.id)
    if (c.wp_id) companyByWpId.set(c.wp_id, c.id)
  }

  const { data: validCrew } = await supabase.from('crew_members').select('id, wp_id')
  const crewByWpId = new Map()
  const validCrewIds = new Set()
  for (const c of (validCrew ?? [])) {
    validCrewIds.add(c.id)
    if (c.wp_id) crewByWpId.set(c.wp_id, c.id)
  }

  console.log(`  Valid companies: ${validCompanyIds.size} (${companyByWpId.size} with wp_id)`)
  console.log(`  Valid crew members: ${validCrewIds.size} (${crewByWpId.size} with wp_id)`)

  // Parse contacts
  const companyLinkRows = []
  let contactParseErrors = 0
  let contactsFound = 0

  for (const prod of allProductions) {
    const parsed = parseRawField(prod._raw_contact)
    if (!parsed) { contactParseErrors++; continue }

    const entries = toEntries(parsed)
    for (const contact of entries) {
      if (!contact || typeof contact !== 'object') continue

      if (contact.contactID) {
        // New format: linked by WP post ID
        const wpId = parseInt(String(contact.contactID), 10)
        const supabaseId = companyByWpId.get(wpId)
        if (supabaseId) {
          companyLinkRows.push({
            production_id: prod.id,
            company_id: supabaseId,
            inline_name: null,
            inline_address: null,
          })
          contactsFound++
        } else {
          // Company wasn't migrated — store as inline reference
          companyLinkRows.push({
            production_id: prod.id,
            company_id: null,
            inline_name: `[Company WP#${wpId}]`,
            inline_address: null,
          })
          contactsFound++
        }
      } else if (contact.companies !== undefined) {
        // Old format: inline data
        const companies = Array.isArray(contact.companies)
          ? contact.companies : [contact.companies]
        const addresses = Array.isArray(contact.address) ? contact.address : [contact.address || '']

        for (let i = 0; i < companies.length; i++) {
          const name = typeof companies[i] === 'string' ? companies[i].trim() : null
          if (!name) continue
          companyLinkRows.push({
            production_id: prod.id,
            company_id: null,
            inline_name: name,
            inline_address: addresses[i] || null,
          })
          contactsFound++
        }
      }
    }
  }

  // Parse crew roles
  const crewRoleRows = []
  let rolesParseErrors = 0
  let rolesFound = 0

  for (const prod of allProductions) {
    const parsed = parseRawField(prod._raw_roles)
    if (!parsed) { rolesParseErrors++; continue }

    const entries = toEntries(parsed)
    for (const roleGroup of entries) {
      if (!roleGroup || typeof roleGroup !== 'object') continue

      if (roleGroup.rolename !== undefined) {
        // New format: rolename + peoples array
        const roleName = roleGroup.rolename || 'Unknown'
        const peoples = toEntries(roleGroup.peoples)

        for (const person of peoples) {
          if (!person) continue

          if (person.peopleID) {
            const wpId = parseInt(String(person.peopleID), 10)
            const supabaseId = crewByWpId.get(wpId)
            crewRoleRows.push({
              production_id: prod.id,
              crew_id: supabaseId || null,
              role_name: roleName,
              inline_name: supabaseId ? null : (person.name || `[Crew WP#${wpId}]`),
            })
            rolesFound++
          } else if (person.name && typeof person.name === 'string' && person.name.trim()) {
            crewRoleRows.push({
              production_id: prod.id,
              crew_id: null,
              role_name: roleName,
              inline_name: person.name.trim(),
            })
            rolesFound++
          }
        }
      } else if (roleGroup.role !== undefined && roleGroup.name !== undefined) {
        // Old format: parallel arrays
        const roleArr = Array.isArray(roleGroup.role) ? roleGroup.role : [roleGroup.role]
        const nameArr = Array.isArray(roleGroup.name) ? roleGroup.name : [roleGroup.name]
        const maxLen = Math.max(roleArr.length, nameArr.length)

        for (let i = 0; i < maxLen; i++) {
          const roleName = roleArr[i] || 'Unknown'
          const personName = nameArr[i] || null
          if (!roleName && !personName) continue

          crewRoleRows.push({
            production_id: prod.id,
            crew_id: null,
            role_name: roleName,
            inline_name: typeof personName === 'string' ? personName.trim() : personName,
          })
          rolesFound++
        }
      }
    }
  }

  console.log(`\n=== Results ===`)
  console.log(`  Contact entries found: ${contactsFound} (parse errors: ${contactParseErrors})`)
  console.log(`  Crew role entries found: ${rolesFound} (parse errors: ${rolesParseErrors})`)
  console.log(`  Company link rows to insert: ${companyLinkRows.length}`)
  console.log(`  Crew role rows to insert: ${crewRoleRows.length}`)

  // Deduplicate
  const dedupeCompany = new Map()
  for (const row of companyLinkRows) {
    const key = `${row.production_id}-${row.company_id}-${row.inline_name}`
    if (!dedupeCompany.has(key)) dedupeCompany.set(key, row)
  }
  const dedupeCrew = new Map()
  for (const row of crewRoleRows) {
    const key = `${row.production_id}-${row.crew_id}-${row.role_name}-${row.inline_name}`
    if (!dedupeCrew.has(key)) dedupeCrew.set(key, row)
  }

  const uniqueCompanyLinks = Array.from(dedupeCompany.values())
  const uniqueCrewRoles = Array.from(dedupeCrew.values())
  console.log(`  After dedup: ${uniqueCompanyLinks.length} company links, ${uniqueCrewRoles.length} crew roles`)

  // Clear and insert
  console.log(`\n  Clearing existing company links...`)
  await supabase.from('production_company_links').delete().gte('id', 0)

  console.log(`  Inserting ${uniqueCompanyLinks.length} company links...`)
  for (let i = 0; i < uniqueCompanyLinks.length; i += 500) {
    const chunk = uniqueCompanyLinks.slice(i, i + 500)
    const { error } = await supabase.from('production_company_links').insert(chunk)
    if (error) console.error(`  Error at batch ${i}:`, error.message)
    else process.stdout.write(`    Batch ${i}-${i + chunk.length}... OK\n`)
  }

  console.log(`  Clearing existing crew roles...`)
  await supabase.from('production_crew_roles').delete().gte('id', 0)

  console.log(`  Inserting ${uniqueCrewRoles.length} crew roles...`)
  for (let i = 0; i < uniqueCrewRoles.length; i += 500) {
    const chunk = uniqueCrewRoles.slice(i, i + 500)
    const { error } = await supabase.from('production_crew_roles').insert(chunk)
    if (error) console.error(`  Error at batch ${i}:`, error.message)
    else process.stdout.write(`    Batch ${i}-${i + chunk.length}... OK\n`)
  }

  // Verify
  const { count: finalCompany } = await supabase.from('production_company_links').select('*', { count: 'exact', head: true })
  const { count: finalCrew } = await supabase.from('production_crew_roles').select('*', { count: 'exact', head: true })
  console.log(`\n✓ Done! Final counts: ${finalCompany} company links, ${finalCrew} crew roles`)
}

main().catch(e => { console.error(e); process.exit(1) })
