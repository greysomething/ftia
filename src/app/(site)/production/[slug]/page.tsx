import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getProductionBySlug, getProductionSlugs } from '@/lib/queries'
import { getUser, isMember } from '@/lib/auth'
import { formatProductionDate, PHASE_LABELS, PHASE_COLORS } from '@/lib/utils'
import { MemberGate } from '@/components/MemberGate'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const production = await getProductionBySlug(slug)
  if (!production) return { title: 'Not Found' }

  const typeLabel = (production as any).production_type_links?.[0]?.production_types?.name ?? 'Production'
  const desc = production.excerpt ?? `${production.title} — ${typeLabel} currently in ${PHASE_LABELS[production.computed_status]}`

  return {
    title: production.title,
    description: desc,
    openGraph: {
      title: production.title,
      description: desc,
      type: 'article',
    },
    alternates: {
      canonical: `/production/${production.slug}`,
    },
  }
}

export async function generateStaticParams() {
  const slugs = await getProductionSlugs()
  return slugs.map((p) => ({ slug: p.slug }))
}

export default async function ProductionPage({ params }: Props) {
  const { slug } = await params
  const production = await getProductionBySlug(slug)
  if (!production) notFound()

  const user = await getUser()
  const member = user ? await isMember(user.id) : false

  const p = production as any
  const types = p.production_type_links ?? []
  const statuses = p.production_status_links ?? []
  const locations = p.production_locations ?? []
  const companies = p.production_company_links ?? []
  const crewRoles = p.production_crew_roles ?? []

  const primaryType = types.find((t: any) => t.is_primary)?.production_types ?? types[0]?.production_types
  const primaryStatus = statuses.find((s: any) => s.is_primary)?.production_statuses ?? statuses[0]?.production_statuses

  // JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: production.title,
    description: production.excerpt ?? undefined,
    productionCompany: companies
      .filter((c: any) => c.companies)
      .map((c: any) => ({ '@type': 'Organization', name: c.companies.title })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="page-wrap py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main */}
          <div className="flex-1">
            <div className="white-bg p-6">
              {/* Title block */}
              <div className="mb-6">
                <h1 className="text-3xl font-bold text-primary">
                  {production.title}
                  {primaryType && (
                    <span className="text-lg font-normal text-gray-500 ml-2">
                      (
                      <Link href={`/production-type/${primaryType.slug}`} className="hover:underline">
                        {primaryType.name}
                      </Link>
                      )
                    </span>
                  )}
                </h1>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <span className={`production-status-badge ${PHASE_COLORS[production.computed_status]}`}>
                    {PHASE_LABELS[production.computed_status]}
                  </span>
                  {primaryStatus && (
                    <Link
                      href={`/production-union/${primaryStatus.slug}`}
                      className="text-sm text-gray-500 hover:text-primary"
                    >
                      {primaryStatus.name}
                    </Link>
                  )}
                  <span className="text-xs text-gray-400">
                    Last Updated: {new Date(production.wp_updated_at ?? '').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              </div>

              {/* Details table */}
              <table className="text-sm mb-6 w-full max-w-sm">
                <tbody>
                  <tr className="border-b">
                    <th className="py-2 pr-4 text-left text-gray-500 font-medium w-32">Shoot Date:</th>
                    <td className="py-2 text-gray-800">
                      {formatProductionDate(production.production_date_start)}
                    </td>
                  </tr>
                  {production.production_date_end && (
                    <tr className="border-b">
                      <th className="py-2 pr-4 text-left text-gray-500 font-medium">Wrap Date:</th>
                      <td className="py-2 text-gray-800">
                        {formatProductionDate(production.production_date_end)}
                      </td>
                    </tr>
                  )}
                  {locations.length > 0 && (
                    <tr className="border-b">
                      <th className="py-2 pr-4 text-left text-gray-500 font-medium">Locations:</th>
                      <td className="py-2 text-gray-800">
                        {locations.map((l: any) => l.location).join(', ')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Description */}
              {production.content && (
                <>
                  <div className="pro-title">Project Summary:</div>
                  <div
                    className="prose prose-sm max-w-none text-gray-700"
                    dangerouslySetInnerHTML={{ __html: production.content }}
                  />
                </>
              )}

              {/* Production Contacts */}
              {companies.length > 0 && (
                <div className="mt-6">
                  <div className="pro-title">Production Contacts:</div>
                  <div className="space-y-4">
                    {companies.map((link: any) => {
                      const company = link.companies
                      if (company) {
                        return (
                          <div key={link.id} className="border rounded-lg p-4">
                            {member ? (
                              <Link
                                href={`/production-contact/${company.slug}`}
                                className="font-semibold text-primary hover:underline flex items-center gap-1"
                              >
                                {company.title}
                                <img src="/images/icon-view-company-or-crew-listing.png" alt="" width={10} className="inline" />
                              </Link>
                            ) : (
                              <span className="font-semibold text-gray-800">{company.title}</span>
                            )}
                            {member && company.addresses?.[0] && (
                              <p className="text-sm text-gray-500 mt-1">{company.addresses[0]}</p>
                            )}
                            <div className="flex gap-4 mt-2">
                              {member && company.phones?.filter(Boolean).length > 0 && (
                                <span className="text-sm text-gray-600">
                                  📞 {company.phones.filter(Boolean).join(', ')}
                                </span>
                              )}
                              {member && company.emails?.filter(Boolean).length > 0 && (
                                <span className="text-sm text-gray-600">
                                  ✉️ {company.emails.filter(Boolean).join(', ')}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      }
                      // Inline (no linked company)
                      return (
                        <div key={link.id} className="border rounded-lg p-4">
                          {member ? (
                            <>
                              <span className="font-semibold text-gray-800">
                                {link.inline_name}
                              </span>
                              {link.inline_address && (
                                <p className="text-sm text-gray-500 mt-1">{link.inline_address}</p>
                              )}
                            </>
                          ) : (
                            <span className="font-semibold text-gray-400 italic">
                              [Members Only]
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Cast & Crew */}
              {crewRoles.length > 0 && (
                <div className="mt-6">
                  <div className="pro-title">Cast &amp; Crew:</div>
                  <table className="w-full text-sm">
                    <tbody>
                      {crewRoles.map((role: any) => (
                        <tr key={role.id} className="border-b last:border-0">
                          <td className="py-2 pr-4 text-gray-500 font-medium w-40 align-top">
                            {role.role_name}
                          </td>
                          <td className="py-2 text-gray-800">
                            {member ? (
                              role.crew_members ? (
                                <Link
                                  href={`/production-role/${role.crew_members.slug}`}
                                  className="text-primary hover:underline"
                                >
                                  {role.crew_members.name}
                                </Link>
                              ) : (
                                role.inline_name
                              )
                            ) : (
                              <span className="text-gray-400 italic">[Members Only]</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!member && <MemberGate />}
            </div>
          </div>

          {/* Sidebar */}
          <aside className="lg:w-64 flex-shrink-0 space-y-4">
            <div className="white-bg p-4">
              <h3 className="font-semibold text-primary mb-3">Production Details</h3>
              {types.map((t: any) => (
                <Link
                  key={t.production_types.id}
                  href={`/production-type/${t.production_types.slug}`}
                  className="block text-sm text-gray-600 hover:text-primary mb-1"
                >
                  🎬 {t.production_types.name}
                </Link>
              ))}
              {statuses.map((s: any) => (
                <Link
                  key={s.production_statuses.id}
                  href={`/production-union/${s.production_statuses.slug}`}
                  className="block text-sm text-gray-600 hover:text-primary mb-1"
                >
                  📋 {s.production_statuses.name}
                </Link>
              ))}
            </div>

            {!member && (
              <div className="white-bg p-4 text-center">
                <p className="text-sm text-gray-600 mb-3">
                  Join to see full contact details and crew information.
                </p>
                <Link href="/membership-account/membership-levels" className="btn-accent w-full text-center">
                  Join Now
                </Link>
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  )
}
