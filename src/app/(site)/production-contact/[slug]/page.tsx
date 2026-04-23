import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCompanyBySlug } from '@/lib/queries'
import { getUser, isMember, isAdmin } from '@/lib/auth'
import { MemberGate } from '@/components/MemberGate'
import { createClient } from '@/lib/supabase/server'
import { parsePhpSerialized, formatDate, formatPhone } from '@/lib/utils'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { EditSuggestButton } from '@/components/EditSuggestButton'
import { CrewAvatar } from '@/components/CrewAvatar'
import type { ProductionPhase } from '@/types/database'

const PHASE_COLORS: Record<string, string> = {
  'in-pre-production': 'bg-blue-100 text-blue-800',
  'in-production': 'bg-green-100 text-green-800',
  'in-post-production': 'bg-purple-100 text-purple-800',
  completed: 'bg-gray-100 text-gray-600',
}

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const company = await getCompanyBySlug(slug)
  if (!company) return { title: 'Not Found' }
  return {
    title: `${company.title} | Production List`,
    description: `${company.title} — production company contact details, projects, and staff.`,
    alternates: { canonical: `/production-contact/${company.slug}` },
  }
}

export default async function CompanyPage({ params }: Props) {
  const { slug } = await params
  const company = await getCompanyBySlug(slug)
  if (!company) notFound()

  const user = await getUser()
  const [member, admin] = user
    ? await Promise.all([isMember(user.id), isAdmin(user.id)])
    : [false, false]

  const c = company as any
  const categories = c.company_category_links ?? []
  const staff = c.company_staff ?? []

  // Parse PHP serialized contact fields
  const addresses = parsePhpSerialized(company.addresses)
  const phones = parsePhpSerialized(company.phones).map(formatPhone)
  const faxes = parsePhpSerialized(company.faxes).map(formatPhone)
  const emails = parsePhpSerialized(company.emails)

  // Get linked productions with more data
  const supabase = await createClient()
  const { data: linkedProductions } = await supabase
    .from('production_company_links')
    .select('inline_name, productions(id,title,slug,computed_status,production_date_start,production_type_links(production_types(name,slug)))')
    .eq('company_id', company.id)
    .limit(200)

  const productions = linkedProductions?.map((l: any) => l.productions).filter(Boolean) ?? []

  // Fallback: derive staff from crew who worked on this company's productions
  // if no explicit staff associations exist in company_staff table
  const productionIds = productions.map((p: any) => p.id)
  let derivedStaff: Array<{ crew_id: number; name: string; slug: string; role: string; emails: any; phones: any }> = []

  if (productionIds.length > 0 && staff.length === 0) {
    // Fetch crew roles for this company's productions (paginate for large companies)
    const batchSize = 50
    const allCrewRoles: any[] = []
    for (let i = 0; i < productionIds.length; i += batchSize) {
      const batch = productionIds.slice(i, i + batchSize)
      const { data: roles } = await supabase
        .from('production_crew_roles')
        .select('crew_id, role_name, inline_name, crew_members(id, name, slug, emails, phones)')
        .in('production_id', batch)
        .not('crew_id', 'is', null)
      if (roles) allCrewRoles.push(...roles)
    }

    // Deduplicate by crew_id and pick their most common role
    const crewMap = new Map<number, { crew_id: number; name: string; slug: string; role: string; emails: any; phones: any; count: number }>()
    for (const r of allCrewRoles) {
      const person = r.crew_members
      if (!person) continue
      const existing = crewMap.get(person.id)
      if (existing) {
        existing.count++
        // Keep the role from the entry with the most appearances
      } else {
        crewMap.set(person.id, {
          crew_id: person.id,
          name: person.name,
          slug: person.slug,
          role: r.role_name || '',
          emails: person.emails,
          phones: person.phones,
          count: 1,
        })
      }
    }

    derivedStaff = Array.from(crewMap.values()).sort((a, b) => b.count - a.count)
  }

  // Use derived staff if company_staff is empty
  const effectiveStaff = staff.length > 0 ? staff : derivedStaff

  // Quick stats
  const hasContactInfo = addresses.length > 0 || phones.length > 0 || emails.length > 0
  const primaryCategory = categories.find((cat: any) => cat.is_primary)?.company_categories ?? categories[0]?.company_categories

  const breadcrumbs = [
    { label: 'Companies', href: '/production-contact' },
    ...(primaryCategory ? [{ label: primaryCategory.name, href: `/production-contact?category=${primaryCategory.slug}` }] : []),
    { label: company.title },
  ]

  return (
    <>
      {/* Dark Header */}
      <div className="bg-gradient-to-br from-[#1a2332] via-[#1e2a3a] to-[#162029] text-white">
        <div className="page-wrap py-8 pb-6">
          <Breadcrumbs items={breadcrumbs} />

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mt-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                {/* Company Icon */}
                <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-[#3ea8c8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-start gap-3">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{company.title}</h1>
                    <EditSuggestButton
                      editUrl={`/admin/companies/${company.id}/edit`}
                      entityType="company"
                      entityTitle={company.title}
                      entityId={company.id}
                      isAdmin={admin}
                      isLoggedIn={!!user}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {categories.map((cat: any) => (
                      <Link
                        key={cat.company_categories.id}
                        href={`/production-contact?category=${cat.company_categories.slug}`}
                        className="text-xs font-medium bg-white/10 text-white/80 px-2.5 py-0.5 rounded-full hover:bg-white/20 transition-colors"
                      >
                        {cat.company_categories.name}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {company.wp_updated_at && (
              <div className="text-right text-xs text-white/40 flex-shrink-0">
                <div>Last Updated</div>
                <div className="font-medium text-white/60">{formatDate(company.wp_updated_at)}</div>
              </div>
            )}
          </div>

          {/* Stats Bar */}
          <div className="flex flex-wrap items-center gap-6 mt-6 pt-4 border-t border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#3ea8c8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2m10 2V2M5 8h14M5 8a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V10a2 2 0 00-2-2M5 8h14" />
                </svg>
              </div>
              <div>
                <div className="text-lg font-bold">{productions.length}</div>
                <div className="text-xs text-white/50 uppercase tracking-wider">Projects</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#3ea8c8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <div className="text-lg font-bold">{effectiveStaff.length}</div>
                <div className="text-xs text-white/50 uppercase tracking-wider">Staff</div>
              </div>
            </div>
            {hasContactInfo && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-green-400">Verified</div>
                  <div className="text-xs text-white/50 uppercase tracking-wider">Contact Info</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="page-wrap py-8">
        {/* Non-member CTA */}
        {!member && (
          <div className="mb-6 p-4 bg-gradient-to-r from-[#3ea8c8]/10 to-[#3ea8c8]/5 border border-[#3ea8c8]/20 rounded-xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#3ea8c8]/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-[#3ea8c8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <p className="text-sm text-gray-700">
                <strong>Members</strong> get full access to contact details, staff emails, and direct phone numbers.
              </p>
            </div>
            <Link href="/membership-plans" className="flex-shrink-0 text-sm font-medium bg-[#3ea8c8] !text-white px-4 py-2 rounded-lg hover:bg-[#2d8ba8] transition-colors">
              Join Now
            </Link>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Column */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* About */}
            {company.content && (
              <div className="white-bg overflow-hidden">
                <div className="h-1 bg-[#3ea8c8]" />
                <div className="p-6">
                  <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    About
                  </h2>
                  <div
                    className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: company.content }}
                  />
                </div>
              </div>
            )}

            {/* Contact Information Card */}
            <div className="white-bg overflow-hidden">
              <div className="h-1 bg-[#1a2332]" />
              <div className="p-6">
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Contact Information
                  {!member && <span className="text-xs font-normal text-gray-400 ml-2">— Members Only</span>}
                </h2>

                {member ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {addresses.length > 0 && (
                      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Address</div>
                          <div className="text-sm text-gray-800 mt-0.5">{addresses.join(' / ')}</div>
                        </div>
                      </div>
                    )}
                    {phones.length > 0 && (
                      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</div>
                          <div className="text-sm text-gray-800 mt-0.5">{phones.join(' | ')}</div>
                        </div>
                      </div>
                    )}
                    {faxes.length > 0 && (
                      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Fax</div>
                          <div className="text-sm text-gray-800 mt-0.5">{faxes.join(' | ')}</div>
                        </div>
                      </div>
                    )}
                    {emails.length > 0 && (
                      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Email</div>
                          <div className="text-sm text-gray-800 mt-0.5">
                            {emails.map((e: string, i: number) => (
                              <span key={i}>{i > 0 && ', '}<a href={`mailto:${e}`} className="text-primary hover:underline">{e}</a></span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {(company.linkedin || company.twitter) && (
                      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Social</div>
                          <div className="flex items-center gap-3 mt-1">
                            {company.linkedin && (
                              <a href={company.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-[#0077b5] hover:underline">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                                </svg>
                                LinkedIn
                              </a>
                            )}
                            {company.twitter && (
                              <a href={company.twitter} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:underline">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                </svg>
                                X / Twitter
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 bg-gray-50 rounded-lg text-center">
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <p className="text-sm text-gray-500">Contact details are available to members</p>
                    <Link href="/membership-plans" className="btn-accent text-sm mt-3 inline-block">Unlock Contact Info</Link>
                  </div>
                )}
              </div>
            </div>

            {/* Key Staff / Associated Crew */}
            {effectiveStaff.length > 0 && (
              <div className="white-bg overflow-hidden">
                <div className="h-1 bg-[#1a2332]" />
                <div className="p-6">
                  <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Key Staff ({effectiveStaff.length})
                    {!member && <span className="text-xs font-normal text-gray-400 ml-2">— Contact info for members</span>}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {effectiveStaff.map((s: any) => {
                      // Handle both company_staff format and derived staff format
                      const person = s.crew_members ?? s
                      const personName = person.name ?? ''
                      const personSlug = person.slug ?? ''
                      const personEmails = member ? parsePhpSerialized(person.emails) : []
                      const role = s.position ?? s.role ?? ''
                      return (
                        <div key={s.id ?? s.crew_id} className="border border-gray-200 rounded-lg p-3.5 hover:border-gray-300 transition-colors group">
                          <div className="flex items-start gap-3">
                            <CrewAvatar
                              name={personName}
                              profileImageUrl={person.profile_image_url}
                              linkedin={person.linkedin}
                              size={36}
                            />
                            <div className="flex-1 min-w-0">
                              {member && personSlug ? (
                                <Link
                                  href={`/production-role/${personSlug}`}
                                  className="font-semibold text-[#1a2332] hover:text-[#3ea8c8] transition-colors text-sm inline-flex items-center gap-1"
                                >
                                  {personName}
                                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </Link>
                              ) : (
                                <span className="font-semibold text-gray-800 text-sm">{personName}</span>
                              )}
                              {role && (
                                <p className="text-xs text-gray-500 mt-0.5">{role}</p>
                              )}
                              {personEmails.length > 0 && (
                                <p className="text-xs text-gray-400 mt-1 truncate">
                                  <a href={`mailto:${personEmails[0]}`} className="hover:text-primary transition-colors">{personEmails[0]}</a>
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Linked Productions */}
            {productions.length > 0 && (
              <div className="white-bg overflow-hidden">
                <div className="h-1 bg-[#1a2332]" />
                <div className="p-6">
                  <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2m10 2V2M5 8h14M5 8a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V10a2 2 0 00-2-2M5 8h14" />
                    </svg>
                    Productions ({productions.length})
                  </h2>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Type</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productions.map((prod: any, idx: number) => {
                          const phase = prod.computed_status as string
                          const typeLabel = prod.production_type_links?.[0]?.production_types?.name
                          return (
                            <tr key={prod.id} className={idx > 0 ? 'border-t border-gray-200' : ''}>
                              <td className="px-4 py-2.5">
                                <Link href={`/production/${prod.slug}`} className="font-medium text-primary hover:underline">
                                  {prod.title}
                                </Link>
                                {prod.role_label && (
                                  <span className="ml-2 text-xs text-gray-400">({prod.role_label})</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 hidden sm:table-cell">
                                {typeLabel ? (
                                  <span className="badge badge-cyan">{typeLabel}</span>
                                ) : (
                                  <span className="text-gray-300">&mdash;</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 hidden sm:table-cell">
                                <span className={`production-status-badge ${PHASE_COLORS[phase] ?? 'bg-gray-100 text-gray-600'}`}>
                                  {phase?.replace(/-/g, ' ').replace(/^in /, 'In ') ?? 'Unknown'}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Member Gate */}
            {!member && (
              <MemberGate message="Join to see full contact details, staff emails, and all linked productions." />
            )}
          </div>

          {/* Sidebar */}
          <aside className="lg:w-72 flex-shrink-0 space-y-5">
            {/* Quick Facts */}
            <div className="white-bg p-5">
              <h3 className="font-semibold text-primary mb-4 text-sm flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Quick Facts
              </h3>
              <dl className="space-y-3 text-sm">
                {categories.length > 0 && (
                  <div>
                    <dt className="text-xs text-gray-500 uppercase tracking-wider">Category</dt>
                    <dd className="mt-0.5 space-y-0.5">
                      {categories.map((cat: any) => (
                        <span key={cat.company_categories.id} className="block font-medium text-gray-800">
                          {cat.company_categories.name}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-gray-500 uppercase tracking-wider">Active Projects</dt>
                  <dd className="mt-0.5 font-medium text-gray-800">{productions.length}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 uppercase tracking-wider">Staff Listed</dt>
                  <dd className="mt-0.5 font-medium text-gray-800">{effectiveStaff.length}</dd>
                </div>
                {company.wp_updated_at && (
                  <div>
                    <dt className="text-xs text-gray-500 uppercase tracking-wider">Last Updated</dt>
                    <dd className="mt-0.5 text-gray-600">{formatDate(company.wp_updated_at)}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Membership CTA */}
            {!member && (
              <div className="white-bg p-5 text-center bg-gradient-to-b from-primary/5 to-white">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="font-bold text-primary text-sm mb-1.5">Unlock Full Access</h3>
                <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                  Get direct contact details, staff emails, and access to 10,000+ productions.
                </p>
                <Link href="/membership-plans" className="btn-accent w-full text-sm">
                  Join Now — See Plans
                </Link>
                <Link href="/login" className="block mt-2 text-xs text-gray-500 hover:text-primary">
                  Already a member? Log in
                </Link>
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  )
}
