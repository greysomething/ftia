import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProductionsForWeek } from '@/lib/queries'
import { getUser, isMember } from '@/lib/auth'
import { formatProductionDate, formatLocations, formatDate, formatPhone, parsePhpSerialized, PHASE_LABELS, PHASE_COLORS } from '@/lib/utils'
import { MemberGate } from '@/components/MemberGate'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import type { ProductionPhase } from '@/types/database'

interface Props {
  params: Promise<{ date: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params
  const d = new Date(date + 'T00:00:00Z')
  const formatted = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  return {
    title: `Production List — Week of ${formatted}`,
    description: `Film and TV productions updated the week of ${formatted}. Browse crew, contacts, locations, and project details.`,
  }
}

export default async function WeeklyListPage({ params }: Props) {
  const { date } = await params

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound()

  const productions = await getProductionsForWeek(date)
  if (!productions.length) notFound()

  const user = await getUser()
  const member = user ? await isMember(user.id) : false

  const weekDate = new Date(date + 'T00:00:00Z')
  const endDate = new Date(weekDate)
  endDate.setDate(weekDate.getDate() + 6)

  const formattedWeek = weekDate.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
  const formattedEnd = endDate.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  // Count stats
  const totalCrew = productions.reduce((sum: number, p: any) => sum + (p.production_crew_roles?.length ?? 0), 0)
  const totalContacts = productions.reduce((sum: number, p: any) => sum + (p.production_company_links?.length ?? 0), 0)

  // Group by phase
  const phaseGroups = new Map<ProductionPhase, any[]>()
  for (const p of productions) {
    const phase = (p as any).computed_status as ProductionPhase
    const existing = phaseGroups.get(phase) ?? []
    existing.push(p)
    phaseGroups.set(phase, existing)
  }

  const breadcrumbs = [
    { label: 'Productions', href: '/productions' },
    { label: 'Weekly Lists', href: '/productions?view=weekly' },
    { label: `Week of ${formattedWeek}` },
  ]

  return (
    <div className="page-wrap py-8">
      <Breadcrumbs items={breadcrumbs} />

      <div className="max-w-5xl mx-auto">
        {/* Header Card */}
        <div className="white-bg overflow-hidden mb-6">
          <div className="h-1.5 bg-gradient-to-r from-primary to-accent" />
          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-accent uppercase tracking-widest mb-1">
                  FTIA Weekly Production List
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-primary">
                  Week of {formattedWeek}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  {formattedWeek} — {formattedEnd}
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">{productions.length}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Projects</div>
                </div>
                {totalContacts > 0 && (
                  <div className="text-center">
                    <div className="text-3xl font-bold text-accent">{totalContacts}</div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide">Contacts</div>
                  </div>
                )}
                {totalCrew > 0 && (
                  <div className="text-center">
                    <div className="text-3xl font-bold text-gray-600">{totalCrew}</div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide">Crew</div>
                  </div>
                )}
              </div>
            </div>

            {/* Phase breakdown bar */}
            {phaseGroups.size > 1 && (
              <div className="mt-5 flex flex-wrap gap-3">
                {(['in-pre-production', 'in-production', 'in-post-production', 'completed'] as ProductionPhase[]).map(phase => {
                  const count = phaseGroups.get(phase)?.length ?? 0
                  if (count === 0) return null
                  return (
                    <div key={phase} className="flex items-center gap-1.5">
                      <span className={`production-status-badge text-xs ${PHASE_COLORS[phase]}`}>
                        {PHASE_LABELS[phase]}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">{count}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {!member && (
          <div className="mb-6">
            <MemberGate />
          </div>
        )}

        {/* Production Listings */}
        <div className="space-y-5">
          {productions.map((p: any, index: number) => {
            const types = p.production_type_links ?? []
            const statuses = p.production_status_links ?? []
            const locations = p.production_locations ?? []
            const companies = p.production_company_links ?? []
            const crewRoles = p.production_crew_roles ?? []
            const primaryType = types.find((t: any) => t.is_primary)?.production_types ?? types[0]?.production_types
            const primaryStatus = statuses.find((s: any) => s.is_primary)?.production_statuses ?? statuses[0]?.production_statuses
            const phase: ProductionPhase = p.computed_status
            const locationStr = formatLocations(locations)

            return (
              <article key={p.id} className="white-bg overflow-hidden">
                {/* Thin color stripe per phase */}
                <div className={`h-0.5 ${phase === 'in-production' ? 'bg-green-400' : phase === 'in-pre-production' ? 'bg-blue-400' : phase === 'in-post-production' ? 'bg-purple-400' : 'bg-gray-300'}`} />

                <div className="p-5 sm:p-6">
                  {/* Title Row */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-400 font-mono">#{index + 1}</span>
                        <span className={`production-status-badge text-xs ${PHASE_COLORS[phase]}`}>
                          {PHASE_LABELS[phase]}
                        </span>
                      </div>
                      <h2 className="text-lg font-bold text-primary leading-snug">
                        <Link href={`/production/${p.slug}`} className="hover:text-primary-light">
                          {p.title}
                        </Link>
                      </h2>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mt-1">
                        {primaryType && (
                          <Link href={`/production-type/${primaryType.slug}`} className="badge badge-cyan text-xs">
                            {primaryType.name}
                          </Link>
                        )}
                        {primaryStatus && (
                          <Link href={`/production-union/${primaryStatus.slug}`} className="badge badge-purple text-xs">
                            {primaryStatus.name}
                          </Link>
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/production/${p.slug}`}
                      className="flex-shrink-0 btn-outline text-xs px-3 py-1.5 hidden sm:inline-flex"
                    >
                      Full Details
                    </Link>
                  </div>

                  {/* Key Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 p-3 bg-gray-50 rounded-lg text-sm">
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">Shoot Date</span>
                      <span className="text-gray-800 font-medium">
                        {formatProductionDate(p.production_date_start)}
                        {p.production_date_end && p.production_date_end !== p.production_date_start && (
                          <span className="text-gray-400 font-normal"> — {formatProductionDate(p.production_date_end)}</span>
                        )}
                      </span>
                    </div>
                    {locationStr && (
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">
                          {locations.length === 1 ? 'Location' : 'Locations'}
                        </span>
                        <span className="text-gray-800 font-medium">{locationStr}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">Last Updated</span>
                      <span className="text-gray-800 font-medium">{formatDate(p.wp_updated_at)}</span>
                    </div>
                  </div>

                  {/* Description */}
                  {(p.content || p.excerpt) && (
                    <div className="mb-4">
                      {p.content ? (
                        <div
                          className="prose prose-sm max-w-none text-gray-600 leading-relaxed line-clamp-3"
                          dangerouslySetInnerHTML={{ __html: p.content }}
                        />
                      ) : (
                        <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{p.excerpt}</p>
                      )}
                    </div>
                  )}

                  {/* Production Contacts & Crew */}
                  {(companies.length > 0 || crewRoles.length > 0) && (
                    <div className="border-t border-gray-200 pt-4">
                      {member ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          {/* Contacts */}
                          {companies.length > 0 && (
                            <div>
                              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                Production Contacts
                              </h3>
                              <div className="space-y-3">
                                {companies.map((link: any) => {
                                  const company = link.companies
                                  if (!company) {
                                    if (link.inline_name) {
                                      const phones = (link.inline_phones ?? []).map(formatPhone).filter(Boolean)
                                      const emails = (link.inline_emails ?? []).filter(Boolean)
                                      return (
                                        <div key={link.id} className="bg-white border border-gray-100 rounded-md p-3">
                                          <span className="font-semibold text-sm text-gray-800">{link.inline_name}</span>
                                          <div className="mt-1 space-y-0.5">
                                            {link.inline_address && (
                                              <div className="flex items-start gap-1.5 text-xs text-gray-500">
                                                <svg className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                                <span>{link.inline_address}</span>
                                              </div>
                                            )}
                                            {phones.length > 0 && (
                                              <div className="flex items-start gap-1.5 text-xs text-gray-500">
                                                <svg className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                                </svg>
                                                <span>{phones.join(' | ')}</span>
                                              </div>
                                            )}
                                            {emails.length > 0 && (
                                              <div className="flex items-start gap-1.5 text-xs text-gray-500">
                                                <svg className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                </svg>
                                                <span>{emails.join(', ')}</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    }
                                    return null
                                  }
                                  return (
                                    <div key={link.id} className="bg-white border border-gray-100 rounded-md p-3">
                                      <Link
                                        href={`/production-contact/${company.slug}`}
                                        className="font-semibold text-sm text-primary hover:underline inline-flex items-center gap-1 group"
                                      >
                                        {company.title}
                                        <svg className="w-3 h-3 text-primary/40 group-hover:text-primary transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                      </Link>
                                      {(() => {
                                        const addrs = parsePhpSerialized(company.addresses)
                                        const phs = parsePhpSerialized(company.phones).map(formatPhone)
                                        const ems = parsePhpSerialized(company.emails)
                                        return (
                                      <div className="mt-1.5 space-y-0.5 text-xs text-gray-500">
                                        {addrs.length > 0 && (
                                          <div className="flex items-start gap-1.5">
                                            <svg className="w-3 h-3 mt-0.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                            </svg>
                                            <span>{addrs.join(', ')}</span>
                                          </div>
                                        )}
                                        {phs.length > 0 && (
                                          <div className="flex items-start gap-1.5">
                                            <svg className="w-3 h-3 mt-0.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                            </svg>
                                            <span>{phs.join(' | ')}</span>
                                          </div>
                                        )}
                                        {ems.length > 0 && (
                                          <div className="flex items-start gap-1.5">
                                            <svg className="w-3 h-3 mt-0.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                            </svg>
                                            <span>
                                              {ems.map((email: string, i: number) => (
                                                <span key={email}>
                                                  {i > 0 && ', '}
                                                  <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a>
                                                </span>
                                              ))}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                        )
                                      })()}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* Crew */}
                          {crewRoles.length > 0 && (
                            <div>
                              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                                Cast &amp; Crew ({crewRoles.length})
                              </h3>
                              <div className="bg-white border border-gray-100 rounded-md overflow-hidden">
                                <table className="w-full text-xs">
                                  <tbody>
                                    {crewRoles.map((role: any, idx: number) => (
                                      <tr key={role.id} className={idx > 0 ? 'border-t border-gray-100' : ''}>
                                        <td className="py-1.5 px-3 text-gray-500 font-medium align-top whitespace-nowrap w-36">
                                          {role.role_name}
                                        </td>
                                        <td className="py-1.5 px-3 text-gray-800">
                                          {role.crew_members ? (
                                            <Link href={`/production-role/${role.crew_members.slug}`} className="text-primary hover:underline inline-flex items-center gap-1 group">
                                              {role.crew_members.name}
                                              <svg className="w-3 h-3 text-primary/40 group-hover:text-primary transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                              </svg>
                                            </Link>
                                          ) : (
                                            role.inline_name ?? '—'
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Non-member teaser */
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 text-sm text-gray-400">
                            {companies.length > 0 && (
                              <span className="flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                {companies.length} contact{companies.length !== 1 ? 's' : ''}
                              </span>
                            )}
                            {crewRoles.length > 0 && (
                              <span className="flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                {crewRoles.length} crew member{crewRoles.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <Link href="/membership-plans" className="text-xs text-primary hover:underline font-medium flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            Unlock Details
                          </Link>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mobile CTA */}
                  <div className="mt-4 sm:hidden">
                    <Link
                      href={`/production/${p.slug}`}
                      className="btn-outline text-xs w-full text-center"
                    >
                      View Full Listing
                    </Link>
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        {/* Footer navigation */}
        <div className="mt-8 flex items-center justify-between">
          <Link href="/productions?view=weekly" className="text-primary hover:underline font-medium text-sm flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            All Weekly Lists
          </Link>
          <Link href="/productions" className="text-primary hover:underline font-medium text-sm">
            Browse All Productions
          </Link>
        </div>
      </div>
    </div>
  )
}
