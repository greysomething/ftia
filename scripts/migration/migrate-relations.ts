/**
 * Migrate production ↔ company and production ↔ crew relationships.
 * Parses the serialized PHP 'contact' and 'roles' meta fields from wp_postmeta.
 *
 * Two formats exist in the data:
 *
 * NEW FORMAT (contact):
 *   Array of { contactID: "123" }  → links to production-contact post
 *
 * OLD FORMAT (contact):
 *   { companies: [], address: [], phone: [], fax: [], email: [] }
 *   → inline data, no linked post
 *
 * NEW FORMAT (roles):
 *   Array of { rolename: "Director", peoples: [{ peopleID: "123" }] }
 *
 * OLD FORMAT (roles):
 *   { role: [], name: [] }
 *   → inline role/name pairs
 */
import { mysql, unserializePhp } from './db'
import { supabase, batchUpsert } from './supabase-admin'

/** Handle double-serialized PHP data: unserialize, and if result is a string, unserialize again */
function deepUnserialize(val: string): any {
  let result = unserializePhp(val)
  // WordPress sometimes double-serializes: s:NNN:"a:5:{...}"
  if (typeof result === 'string' && result.match(/^[abisNd][:;]/)) {
    const inner = unserializePhp(result)
    if (inner !== null) result = inner
  }
  return result
}

export async function runRelationsMigration() {
  console.log('\n=== RELATIONS MIGRATION ===')

  const contactMeta = mysql(`
    SELECT pm.post_id, pm.meta_value
    FROM wp_postmeta pm
    JOIN wp_posts p ON p.ID = pm.post_id
    WHERE pm.meta_key = 'contact'
      AND p.post_type = 'production'
      AND p.post_status IN ('publish', 'draft', 'private')
      AND pm.meta_value IS NOT NULL AND pm.meta_value != ''
  `)

  const rolesMeta = mysql(`
    SELECT pm.post_id, pm.meta_value
    FROM wp_postmeta pm
    JOIN wp_posts p ON p.ID = pm.post_id
    WHERE pm.meta_key = 'roles'
      AND p.post_type = 'production'
      AND p.post_status IN ('publish', 'draft', 'private')
      AND pm.meta_value IS NOT NULL AND pm.meta_value != ''
  `)

  console.log(`  Found ${contactMeta.length} productions with contact meta`)
  console.log(`  Found ${rolesMeta.length} productions with roles meta`)

  // --- Company links ---
  const companyLinkRows: any[] = []

  for (const row of contactMeta) {
    const productionId = parseInt(row.post_id, 10)
    const parsed = deepUnserialize(row.meta_value)
    if (!parsed) continue

    const contacts = Array.isArray(parsed) ? parsed : [parsed]

    for (const contact of contacts) {
      if (!contact || typeof contact !== 'object') continue

      if (contact.contactID) {
        // New format: linked post
        const companyId = parseInt(String(contact.contactID), 10)
        if (!isNaN(companyId) && companyId > 0) {
          companyLinkRows.push({
            production_id: productionId,
            company_id: companyId,
            inline_name: null,
            inline_address: null,
            inline_phones: [],
            inline_faxes: [],
            inline_emails: [],
          })
        }
      } else if (contact.companies !== undefined) {
        // Old format: inline data (may be array or string)
        const companies = Array.isArray(contact.companies)
          ? contact.companies
          : [contact.companies]
        const addresses = Array.isArray(contact.address) ? contact.address : [contact.address]
        const phones = Array.isArray(contact.phone) ? contact.phone : [contact.phone]
        const faxes = Array.isArray(contact.fax) ? contact.fax : [contact.fax]
        const emails = Array.isArray(contact.email) ? contact.email : [contact.email]

        const maxLen = Math.max(companies.length, 1)
        for (let i = 0; i < maxLen; i++) {
          const name = companies[i] || null
          if (!name) continue
          companyLinkRows.push({
            production_id: productionId,
            company_id: null,
            inline_name: name,
            inline_address: addresses[i] || null,
            inline_phones: phones[i] ? [phones[i]] : [],
            inline_faxes: faxes[i] ? [faxes[i]] : [],
            inline_emails: emails[i] ? [emails[i]] : [],
          })
        }
      }
    }
  }

  // --- Crew role links ---
  const crewRoleRows: any[] = []

  for (const row of rolesMeta) {
    const productionId = parseInt(row.post_id, 10)
    const parsed = deepUnserialize(row.meta_value)
    if (!parsed) continue

    const roles = Array.isArray(parsed) ? parsed : [parsed]

    for (const roleGroup of roles) {
      if (!roleGroup || typeof roleGroup !== 'object') continue

      if (roleGroup.rolename !== undefined && roleGroup.peoples !== undefined) {
        // New format
        const roleName = roleGroup.rolename || 'Unknown'
        const peoples = Array.isArray(roleGroup.peoples) ? roleGroup.peoples : []

        for (const person of peoples) {
          if (!person) continue
          if (person.peopleID) {
            const crewId = parseInt(String(person.peopleID), 10)
            if (!isNaN(crewId) && crewId > 0) {
              crewRoleRows.push({
                production_id: productionId,
                crew_id: crewId,
                role_name: roleName,
                inline_name: null,
              })
            }
          } else if (typeof person === 'string' && person.trim()) {
            crewRoleRows.push({
              production_id: productionId,
              crew_id: null,
              role_name: roleName,
              inline_name: person.trim(),
            })
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
            production_id: productionId,
            crew_id: null,
            role_name: roleName,
            inline_name: personName,
          })
        }
      }
    }
  }

  // Pre-fetch valid IDs to filter out FK violations
  const { data: validCompanies } = await supabase.from('companies').select('id')
  const validCompanyIds = new Set((validCompanies ?? []).map((c: any) => c.id))
  const { data: validCrew } = await supabase.from('crew_members').select('id')
  const validCrewIds = new Set((validCrew ?? []).map((c: any) => c.id))
  const { data: validProds } = await supabase.from('productions').select('id')
  const validProdIds = new Set((validProds ?? []).map((p: any) => p.id))

  // Filter out rows with invalid FK references
  const filteredCompanyLinks = companyLinkRows.filter(r => {
    if (!validProdIds.has(r.production_id)) return false
    if (r.company_id && !validCompanyIds.has(r.company_id)) {
      // Convert to inline link instead of discarding
      r.inline_name = r.inline_name || `Company #${r.company_id}`
      r.company_id = null
    }
    return true
  })

  const filteredCrewRoles = crewRoleRows.filter(r => {
    if (!validProdIds.has(r.production_id)) return false
    if (r.crew_id && !validCrewIds.has(r.crew_id)) {
      r.inline_name = r.inline_name || `Crew #${r.crew_id}`
      r.crew_id = null
    }
    return true
  })

  console.log(`  Inserting ${filteredCompanyLinks.length} company links (${companyLinkRows.length - filteredCompanyLinks.length} filtered)...`)
  if (filteredCompanyLinks.length > 0) {
    await supabase.from('production_company_links').delete().gte('production_id', 1)
    await batchUpsert('production_company_links', filteredCompanyLinks, 500)
  }

  console.log(`  Inserting ${filteredCrewRoles.length} crew role links (${crewRoleRows.length - filteredCrewRoles.length} filtered)...`)
  if (filteredCrewRoles.length > 0) {
    await supabase.from('production_crew_roles').delete().gte('production_id', 1)
    await batchUpsert('production_crew_roles', filteredCrewRoles, 500)
  }

  console.log('\n✓ Relations migration complete.')
}

if (require.main === module) {
  runRelationsMigration().catch((e) => { console.error(e); process.exit(1) })
}
