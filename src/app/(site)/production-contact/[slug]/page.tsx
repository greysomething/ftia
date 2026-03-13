import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCompanyBySlug } from '@/lib/queries'
import { getUser, isMember } from '@/lib/auth'
import { MemberGate } from '@/components/MemberGate'
import { createClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const company = await getCompanyBySlug(slug)
  if (!company) return { title: 'Not Found' }
  return {
    title: company.title,
    description: `${company.title} — production company contact details, projects, and staff.`,
    alternates: { canonical: `/production-contact/${company.slug}` },
  }
}

export default async function CompanyPage({ params }: Props) {
  const { slug } = await params
  const company = await getCompanyBySlug(slug)
  if (!company) notFound()

  const user = await getUser()
  const member = user ? await isMember(user.id) : false

  const c = company as any
  const categories = c.company_category_links ?? []
  const staff = c.company_staff ?? []

  // Get linked productions
  const supabase = await createClient()
  const { data: linkedProductions } = await supabase
    .from('production_company_links')
    .select('productions(id,title,slug,computed_status,production_type_links(production_types(name,slug)))')
    .eq('company_id', company.id)
    .limit(20)

  const productions = linkedProductions?.map((l: any) => l.productions).filter(Boolean) ?? []

  return (
    <div className="page-wrap py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1">
          <div className="white-bg p-6">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-primary">{company.title}</h1>
                <div className="flex flex-wrap gap-2 mt-2">
                  {categories.map((cat: any) => (
                    <Link
                      key={cat.company_categories.id}
                      href={`/production-ccat/${cat.company_categories.slug}`}
                      className="text-xs bg-primary/10 text-primary px-2 py-1 rounded"
                    >
                      {cat.company_categories.name}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {company.content && (
              <div
                className="prose prose-sm max-w-none mt-4 text-gray-700"
                dangerouslySetInnerHTML={{ __html: company.content }}
              />
            )}

            <div className="pro-title">Company Details:</div>
            <div className="space-y-2 text-sm">
              {member && company.addresses?.[0] ? (
                <div>
                  <span className="font-medium text-gray-600">Address: </span>
                  <span>{company.addresses[0]}</span>
                </div>
              ) : !member && (
                <div>
                  <span className="font-medium text-gray-600">Address: </span>
                  <span className="text-gray-400 italic">[Members Only]</span>
                </div>
              )}
              {member && company.phones?.filter(Boolean).length > 0 && (
                <div>
                  <span className="font-medium text-gray-600">Phone: </span>
                  {company.phones.filter(Boolean).join(' / ')}
                </div>
              )}
              {member && company.faxes?.filter(Boolean).length > 0 && (
                <div>
                  <span className="font-medium text-gray-600">Fax: </span>
                  {company.faxes.filter(Boolean).join(' / ')}
                </div>
              )}
              {member && company.emails?.filter(Boolean).length > 0 && (
                <div>
                  <span className="font-medium text-gray-600">Email: </span>
                  {company.emails.filter(Boolean).map((e: string, i: number) => (
                    <span key={i}>{i > 0 ? ', ' : ''}<a href={`mailto:${e}`}>{e}</a></span>
                  ))}
                </div>
              )}
              {member && company.linkedin && (
                <div>
                  <a href={company.linkedin} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline">
                    LinkedIn Profile →
                  </a>
                </div>
              )}
              {member && company.twitter && (
                <div>
                  <a href={company.twitter} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline">
                    Twitter/X →
                  </a>
                </div>
              )}
            </div>

            {/* Staff */}
            {staff.length > 0 && (
              <>
                <div className="pro-title">Company Staff:</div>
                <div className="space-y-3">
                  {staff.map((s: any) => {
                    const person = s.crew_members
                    return (
                      <div key={s.id} className="flex items-start justify-between border rounded-lg p-3">
                        <div>
                          {member ? (
                            <Link
                              href={`/production-role/${person.slug}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {person.name}
                            </Link>
                          ) : (
                            <span className="font-medium text-gray-800">{person.name}</span>
                          )}
                          {s.position && (
                            <span className="text-sm text-gray-500 ml-2">({s.position})</span>
                          )}
                          {member && person.emails?.filter(Boolean).length > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {person.emails.filter(Boolean)[0]}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {!member && <MemberGate message="Join to see full contact details, staff emails, and linked productions." />}

            {/* Linked Productions */}
            {productions.length > 0 && (
              <>
                <div className="pro-title">Projects:</div>
                <div className="space-y-2">
                  {productions.map((prod: any) => (
                    <div key={prod.id} className="flex items-center gap-2">
                      <Link href={`/production/${prod.slug}`} className="text-primary hover:underline">
                        {prod.title}
                      </Link>
                      {prod.production_type_links?.[0]?.production_types && (
                        <span className="text-xs text-gray-400">
                          ({prod.production_type_links[0].production_types.name})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <aside className="lg:w-64 flex-shrink-0">
          {!member && (
            <div className="white-bg p-4 text-center">
              <p className="text-sm text-gray-600 mb-3">Join to see contact details and staff info.</p>
              <Link href="/membership-account/membership-levels" className="btn-accent w-full text-center">
                Join Now
              </Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
