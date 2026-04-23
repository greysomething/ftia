import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getProductionBySlug, getProductionSlugs, getProductionSlugRedirect } from '@/lib/queries'
import { getUser, isMember, isAdmin } from '@/lib/auth'
import { formatProductionDate, formatLocation, formatLocations, PHASE_LABELS, PHASE_COLORS, formatDate, formatPhone, maskEmail, maskPhone, parsePhpSerialized } from '@/lib/utils'
import { MemberGate } from '@/components/MemberGate'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { TrendingSearches } from '@/components/TrendingSearches'
import { EditSuggestButton } from '@/components/EditSuggestButton'
import type { ProductionPhase } from '@/types/database'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const prod = await getProductionBySlug(slug)
  if (!prod) return { title: 'Not Found' }

  const production = prod as any
  const typeLabel = production.production_type_links?.[0]?.production_types?.name ?? 'Production'
  const locations = (production.production_locations ?? [])
    .map((l: any) => formatLocation(l))
    .filter(Boolean)
    .slice(0, 2)
    .join(', ')
  const desc = production.excerpt
    ?? `${production.title} — ${typeLabel} currently ${PHASE_LABELS[production.computed_status as ProductionPhase] ?? production.computed_status}${locations ? ` filming in ${locations}` : ''}`

  return {
    title: `${production.title} | Production List`,
    description: desc,
    openGraph: {
      title: production.title,
      description: desc,
      type: 'article',
    },
    alternates: {
      canonical: `/production/${slug}`,
    },
  }
}

export async function generateStaticParams() {
  const slugs = await getProductionSlugs()
  return slugs.map((p) => ({ slug: p.slug }))
}

export default async function ProductionPage({ params }: Props) {
  const { slug } = await params
  const prod = await getProductionBySlug(slug)
  if (!prod) {
    // Check if this slug was merged into another production — if so, 301 redirect
    const newSlug = await getProductionSlugRedirect(slug)
    if (newSlug && newSlug !== slug) redirect(`/production/${newSlug}`)
    notFound()
  }

  const user = await getUser()
  const [member, admin] = user
    ? await Promise.all([isMember(user.id), isAdmin(user.id)])
    : [false, false]

  const production = prod as any
  const types = production.production_type_links ?? []
  const statuses = production.production_status_links ?? []
  const locations = production.production_locations ?? []
  const companies = production.production_company_links ?? []
  const crewRoles = production.production_crew_roles ?? []

  const primaryType = types.find((t: any) => t.is_primary)?.production_types ?? types[0]?.production_types
  const primaryStatus = statuses.find((s: any) => s.is_primary)?.production_statuses ?? statuses[0]?.production_statuses
  const phase: ProductionPhase = production.computed_status

  // Group crew by role category
  const crewByCategory = new Map<string, any[]>()
  for (const role of crewRoles) {
    const category = categorizeCrew(role.role_name)
    const existing = crewByCategory.get(category) ?? []
    existing.push(role)
    crewByCategory.set(category, existing)
  }

  // Format locations as individual items for display
  const formattedLocations = locations
    .map((l: any) => ({
      display: formatLocation(l),
      city: l.city,
      stage: l.stage,
      country: l.country,
    }))
    .filter((l: any) => l.display)
    // deduplicate by display string
    .filter((v: any, i: number, a: any[]) => a.findIndex(x => x.display === v.display) === i)

  // JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: production.title,
    description: production.excerpt ?? undefined,
    dateModified: production.wp_updated_at,
    productionCompany: companies
      .filter((c: any) => c.companies)
      .map((c: any) => ({ '@type': 'Organization', name: c.companies.title })),
    ...(formattedLocations.length > 0 && {
      locationCreated: formattedLocations.map((l: any) => ({
        '@type': 'Place',
        name: l.display,
      })),
    }),
  }

  const breadcrumbs = [
    { label: 'Productions', href: '/productions' },
    ...(primaryType ? [{ label: primaryType.name, href: `/production-type/${primaryType.slug}` }] : []),
    { label: production.title },
  ]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="page-wrap py-8">
        <Breadcrumbs items={breadcrumbs} />

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Hero Header Card */}
            <div className="white-bg overflow-hidden mb-6">
              {/* Color accent bar */}
              <div className={`h-1.5 ${phase === 'in-production' ? 'bg-green-500' : phase === 'in-pre-production' ? 'bg-blue-500' : phase === 'in-post-production' ? 'bg-purple-500' : 'bg-gray-400'}`} />

              <div className="p-6">
                {/* Title & Status */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
                  <div className="flex-1">
                    <div className="flex items-start gap-3">
                      <h1 className="text-2xl sm:text-3xl font-bold text-primary leading-tight">
                        {production.title}
                      </h1>
                      <EditSuggestButton
                        editUrl={`/admin/productions/${production.id}/edit`}
                        entityType="production"
                        entityTitle={production.title}
                        entityId={production.id}
                        isAdmin={admin}
                        isLoggedIn={!!user}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 mt-2.5">
                      <span className={`production-status-badge ${PHASE_COLORS[phase]}`}>
                        {PHASE_LABELS[phase]}
                      </span>
                      {primaryType && (
                        <Link
                          href={`/production-type/${primaryType.slug}`}
                          className="badge badge-cyan"
                        >
                          {primaryType.name}
                        </Link>
                      )}
                      {primaryStatus && (
                        <Link
                          href={`/production-union/${primaryStatus.slug}`}
                          className="badge badge-purple"
                        >
                          {primaryStatus.name}
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-400 flex-shrink-0">
                    <div>Last Updated</div>
                    <div className="font-medium text-gray-600">
                      {formatDate(production.updated_at ?? production.wp_updated_at)}
                    </div>
                  </div>
                </div>

                {/* Key Facts Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                  {/* Shoot Date */}
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4.5 h-4.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Shoot Date</div>
                      <div className="text-sm font-semibold text-gray-800 mt-0.5">
                        {formatProductionDate(production.production_date_start)}
                        {production.production_date_end && production.production_date_end !== production.production_date_start && (
                          <span className="text-gray-400 font-normal"> — {formatProductionDate(production.production_date_end)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Location */}
                  {formattedLocations.length > 0 && (
                    <div className={`flex items-start gap-3 ${formattedLocations.length > 2 ? 'sm:col-span-2 lg:col-span-1' : ''}`}>
                      <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4.5 h-4.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {formattedLocations.length === 1 ? 'Location' : `Locations (${formattedLocations.length})`}
                        </div>
                        {formattedLocations.length === 1 ? (
                          <div className="text-sm font-semibold text-gray-800 mt-0.5">
                            {formattedLocations[0].display}
                          </div>
                        ) : (
                          <ul className="mt-0.5 space-y-0.5">
                            {formattedLocations.map((l: any, i: number) => (
                              <li key={i} className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                                <span className="w-1 h-1 rounded-full bg-green-400 flex-shrink-0" />
                                {l.display}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Type / Union Status */}
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4.5 h-4.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2m10 2V2M5 8h14M5 8a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V10a2 2 0 00-2-2M5 8h14m-7 4v4m-4-4v4m8-4v4" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Project Type</div>
                      <div className="text-sm font-semibold text-gray-800 mt-0.5">
                        {types.map((t: any, i: number) => (
                          <span key={t.production_types.id}>
                            {i > 0 && ', '}
                            <Link href={`/production-type/${t.production_types.slug}`} className="hover:underline">
                              {t.production_types.name}
                            </Link>
                          </span>
                        ))}
                        {types.length === 0 && <span className="text-gray-400">—</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Project Summary */}
            {(production.content || production.excerpt) && (
              <div className="white-bg p-6 mb-6">
                <h2 className="pro-title !mt-0">Project Summary</h2>
                {production.content ? (
                  <div
                    className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: production.content }}
                  />
                ) : production.excerpt ? (
                  <p className="text-sm text-gray-700 leading-relaxed">{production.excerpt}</p>
                ) : null}
              </div>
            )}

            {/* Production Contacts */}
            {companies.length > 0 && (
              <div className="white-bg p-6 mb-6">
                <h2 className="pro-title !mt-0">
                  Production Contacts
                  {!member && <span className="text-xs font-normal text-gray-400 ml-2">— Members Only</span>}
                </h2>
                <div className="space-y-4">
                  {companies.map((link: any) => {
                    const company = link.companies
                    if (company) {
                      return (
                        <div key={link.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              {member ? (
                                <Link
                                  href={`/production-contact/${company.slug}`}
                                  className="font-semibold text-primary hover:underline inline-flex items-center gap-1.5 group"
                                >
                                  {company.title}
                                  <svg className="w-3.5 h-3.5 text-primary/40 group-hover:text-primary transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </Link>
                              ) : (
                                <span className="font-semibold text-gray-800">{company.title}</span>
                              )}
                              {link.role_label && (
                                <span className="ml-2 badge badge-gray text-xs">{link.role_label}</span>
                              )}
                            </div>
                          </div>

                          {member ? (
                            (() => {
                              const addresses = parsePhpSerialized(company.addresses)
                              const phones = parsePhpSerialized(company.phones).map(formatPhone)
                              const emails = parsePhpSerialized(company.emails)
                              const websites = parsePhpSerialized(company.websites)
                              return (
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {addresses.length > 0 && (
                                <div className="flex items-start gap-2 text-sm text-gray-600">
                                  <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                  <span>{addresses.join(', ')}</span>
                                </div>
                              )}
                              {phones.length > 0 && (
                                <div className="flex items-start gap-2 text-sm text-gray-600">
                                  <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                  </svg>
                                  <span>{phones.join(' | ')}</span>
                                </div>
                              )}
                              {emails.length > 0 && (
                                <div className="flex items-start gap-2 text-sm text-gray-600">
                                  <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                  <span>
                                    {emails.map((email: string, i: number) => (
                                      <span key={email}>
                                        {i > 0 && ', '}
                                        <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a>
                                      </span>
                                    ))}
                                  </span>
                                </div>
                              )}
                              {websites.length > 0 && (
                                <div className="flex items-start gap-2 text-sm text-gray-600">
                                  <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                  </svg>
                                  <span>
                                    {websites.map((url: string, i: number) => (
                                      <span key={url}>
                                        {i > 0 && ', '}
                                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{url.replace(/^https?:\/\//, '')}</a>
                                      </span>
                                    ))}
                                  </span>
                                </div>
                              )}
                            </div>
                              )
                            })()
                          ) : (
                            <div className="mt-2 text-sm text-gray-400 italic flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                              </svg>
                              Contact details available to members
                            </div>
                          )}
                        </div>
                      )
                    }
                    // Inline contact (no linked company)
                    return (
                      <div key={link.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <span className="font-semibold text-gray-800">{link.inline_name}</span>
                            {link.role_label && (
                              <span className="ml-2 badge badge-gray text-xs">{link.role_label}</span>
                            )}
                          </div>
                        </div>

                        {member ? (
                          (() => {
                            const phones = (link.inline_phones ?? []).map(formatPhone).filter(Boolean)
                            const emails = (link.inline_emails ?? []).filter(Boolean)
                            const address = link.inline_address
                            return (
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {address && (
                              <div className="flex items-start gap-2 text-sm text-gray-600">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>{address}</span>
                              </div>
                            )}
                            {phones.length > 0 && (
                              <div className="flex items-start gap-2 text-sm text-gray-600">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                <span>{phones.join(' | ')}</span>
                              </div>
                            )}
                            {emails.length > 0 && (
                              <div className="flex items-start gap-2 text-sm text-gray-600">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                <span>
                                  {emails.map((email: string, i: number) => (
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
                          })()
                        ) : (
                          <div className="mt-2 text-sm text-gray-400 italic flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            Contact details available to members
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Cast & Crew */}
            {crewRoles.length > 0 && (
              <div className="white-bg p-6 mb-6">
                <h2 className="pro-title !mt-0">
                  Cast &amp; Crew
                  {!member && <span className="text-xs font-normal text-gray-400 ml-2">— Members Only</span>}
                </h2>
                {member ? (
                  <div className="space-y-5">
                    {Array.from(crewByCategory.entries()).map(([category, roles]) => (
                      <div key={category}>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                          {category}
                        </h3>
                        <div className="bg-gray-50 rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <tbody>
                              {roles.map((role: any, idx: number) => (
                                <tr key={role.id} className={idx > 0 ? 'border-t border-gray-200' : ''}>
                                  <td className="py-2.5 px-3 text-gray-500 font-medium w-44 align-top">
                                    {role.role_name}
                                  </td>
                                  <td className="py-2.5 px-3 text-gray-800">
                                    {role.crew_members ? (
                                      <Link
                                        href={`/production-role/${role.crew_members.slug}`}
                                        className="text-primary hover:underline inline-flex items-center gap-1 group"
                                      >
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
                    ))}
                  </div>
                ) : (
                  /* Non-member: show role names but blur the names */
                  <div>
                    <div className="bg-gray-50 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <tbody>
                          {crewRoles.slice(0, 5).map((role: any, idx: number) => (
                            <tr key={role.id} className={idx > 0 ? 'border-t border-gray-200' : ''}>
                              <td className="py-2.5 px-3 text-gray-500 font-medium w-44 align-top">
                                {role.role_name}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="member-blur text-gray-400">Name Hidden</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {crewRoles.length > 5 && (
                      <p className="text-xs text-gray-400 mt-2 text-center">
                        +{crewRoles.length - 5} more crew members
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Member Gate CTA */}
            {!member && (
              <div className="mb-6">
                <MemberGate />
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="lg:w-72 flex-shrink-0 space-y-5">
            {/* Quick Facts Card */}
            <div className="white-bg p-5">
              <h3 className="font-semibold text-primary mb-4 text-sm flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Quick Facts
              </h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-gray-500 uppercase tracking-wider">Status</dt>
                  <dd className="mt-0.5">
                    <span className={`production-status-badge ${PHASE_COLORS[phase]}`}>
                      {PHASE_LABELS[phase]}
                    </span>
                  </dd>
                </div>
                {primaryType && (
                  <div>
                    <dt className="text-xs text-gray-500 uppercase tracking-wider">Type</dt>
                    <dd className="mt-0.5 font-medium text-gray-800">
                      <Link href={`/production-type/${primaryType.slug}`} className="hover:underline">
                        {primaryType.name}
                      </Link>
                    </dd>
                  </div>
                )}
                {types.length > 1 && (
                  <div>
                    <dt className="text-xs text-gray-500 uppercase tracking-wider">Also Categorized As</dt>
                    <dd className="mt-0.5 space-y-0.5">
                      {types.slice(1).map((t: any) => (
                        <Link
                          key={t.production_types.id}
                          href={`/production-type/${t.production_types.slug}`}
                          className="block text-gray-600 hover:text-primary text-sm"
                        >
                          {t.production_types.name}
                        </Link>
                      ))}
                    </dd>
                  </div>
                )}
                {statuses.length > 0 && (
                  <div>
                    <dt className="text-xs text-gray-500 uppercase tracking-wider">Union Status</dt>
                    <dd className="mt-0.5 space-y-0.5">
                      {statuses.map((s: any) => (
                        <Link
                          key={s.production_statuses.id}
                          href={`/production-union/${s.production_statuses.slug}`}
                          className="block text-gray-600 hover:text-primary text-sm"
                        >
                          {s.production_statuses.name}
                        </Link>
                      ))}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-gray-500 uppercase tracking-wider">Shoot Date</dt>
                  <dd className="mt-0.5 font-medium text-gray-800">
                    {formatProductionDate(production.production_date_start)}
                  </dd>
                </div>
                {production.production_date_end && production.production_date_end !== production.production_date_start && (
                  <div>
                    <dt className="text-xs text-gray-500 uppercase tracking-wider">Wrap Date</dt>
                    <dd className="mt-0.5 font-medium text-gray-800">
                      {formatProductionDate(production.production_date_end)}
                    </dd>
                  </div>
                )}
                {formattedLocations.length > 0 && (
                  <div>
                    <dt className="text-xs text-gray-500 uppercase tracking-wider">
                      {formattedLocations.length === 1 ? 'Location' : 'Locations'}
                    </dt>
                    <dd className="mt-0.5 space-y-0.5">
                      {formattedLocations.map((l: any, i: number) => (
                        <div key={i} className="text-sm text-gray-800">{l.display}</div>
                      ))}
                    </dd>
                  </div>
                )}
                {companies.length > 0 && (
                  <div>
                    <dt className="text-xs text-gray-500 uppercase tracking-wider">Companies</dt>
                    <dd className="mt-0.5 font-medium text-gray-800">{companies.length}</dd>
                  </div>
                )}
                {crewRoles.length > 0 && (
                  <div>
                    <dt className="text-xs text-gray-500 uppercase tracking-wider">Crew Listed</dt>
                    <dd className="mt-0.5 font-medium text-gray-800">{crewRoles.length}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-gray-500 uppercase tracking-wider">Last Updated</dt>
                  <dd className="mt-0.5 text-gray-600">
                    {formatDate(production.updated_at ?? production.wp_updated_at)}
                  </dd>
                </div>
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
                  Get contact details, crew information, and full access to 10,000+ active productions.
                </p>
                <Link href="/membership-plans" className="btn-accent w-full text-sm">
                  Join Now — See Plans
                </Link>
                <Link href="/login" className="block mt-2 text-xs text-gray-500 hover:text-primary">
                  Already a member? Log in
                </Link>
              </div>
            )}

            {/* Trending */}
            {/* Trending */}
            <TrendingSearches variant="sidebar" limit={8} />
          </aside>
        </div>
      </div>
    </>
  )
}

/** Categorize crew roles into display groups */
function categorizeCrew(roleName: string): string {
  const lower = roleName.toLowerCase()
  // Casting must be checked before Directing since "Casting Director" contains "director"
  if (['casting', 'extras casting', 'background casting'].some(r => lower.includes(r))) {
    return 'Casting'
  }
  if (['director', 'assistant director', '1st ad', '2nd ad', '2nd 2nd ad', 'first assistant director', 'second assistant director'].some(r => lower.includes(r))) {
    return 'Directing'
  }
  if (['producer', 'executive producer', 'co-producer', 'line producer', 'associate producer', 'showrunner'].some(r => lower.includes(r))) {
    return 'Production'
  }
  if (['writer', 'screenwriter', 'story editor', 'staff writer', 'creator'].some(r => lower.includes(r))) {
    return 'Writing'
  }
  if (['cinematographer', 'director of photography', 'dop', 'dp', 'camera operator', 'steadicam', 'gaffer', 'key grip', 'best boy', 'grip', 'electric'].some(r => lower.includes(r))) {
    return 'Camera & Lighting'
  }
  if (['editor', 'post supervisor', 'post production', 'vfx', 'visual effects', 'colorist'].some(r => lower.includes(r))) {
    return 'Post-Production'
  }
  if (['production designer', 'art director', 'set decorator', 'set designer', 'props', 'property master', 'construction'].some(r => lower.includes(r))) {
    return 'Art Department'
  }
  if (['costume', 'wardrobe', 'hair', 'makeup', 'key makeup', 'key hair'].some(r => lower.includes(r))) {
    return 'Costume, Hair & Makeup'
  }
  if (['sound', 'mixer', 'boom', 'music', 'composer', 'music supervisor'].some(r => lower.includes(r))) {
    return 'Sound & Music'
  }
  if (['location', 'location manager', 'location scout'].some(r => lower.includes(r))) {
    return 'Locations'
  }
  if (['stunt', 'coordinator', 'fight'].some(r => lower.includes(r))) {
    return 'Stunts'
  }
  if (['actor', 'cast', 'lead', 'supporting', 'guest star', 'recurring'].some(r => lower.includes(r))) {
    return 'Cast'
  }
  if (['unit production manager', 'production manager', 'upm', 'production coordinator', 'production secretary', 'production accountant', 'accountant'].some(r => lower.includes(r))) {
    return 'Production Management'
  }
  if (['transportation', 'driver', 'transport'].some(r => lower.includes(r))) {
    return 'Transportation'
  }
  return 'Other Crew'
}
