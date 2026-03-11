import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCrewMemberBySlug } from '@/lib/queries'
import { getUser, isMember } from '@/lib/auth'
import { MemberGate } from '@/components/MemberGate'
import { createClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const person = await getCrewMemberBySlug(slug)
  if (!person) return { title: 'Not Found' }
  const cats = (person as any).crew_category_links?.map((c: any) => c.role_categories.name).join(', ')
  return {
    title: person.name,
    description: `${person.name}${cats ? ` — ${cats}` : ''} in the film and television industry.`,
    alternates: { canonical: `/production-role/${person.slug}` },
  }
}

export default async function CrewMemberPage({ params }: Props) {
  const { slug } = await params
  const person = await getCrewMemberBySlug(slug)
  if (!person) notFound()

  const user = await getUser()
  const member = user ? await isMember(user.id) : false

  const p = person as any
  const categories = p.crew_category_links ?? []
  const companyLinks = p.company_staff ?? []

  // Get productions this person is in
  const supabase = await createClient()
  const { data: roleLinks } = await supabase
    .from('production_crew_roles')
    .select('role_name, productions(id,title,slug,production_type_links(production_types(name,slug)))')
    .eq('crew_id', person.id)
    .limit(20)

  return (
    <div className="page-wrap py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1">
          <div className="white-bg p-6">
            <h1 className="text-3xl font-bold text-primary mb-2">{person.name}</h1>

            <div className="flex flex-wrap gap-2 mb-4">
              {categories.map((cat: any) => (
                <Link
                  key={cat.role_categories.id}
                  href={`/production-rcat/${cat.role_categories.slug}`}
                  className="text-xs bg-primary/10 text-primary px-2 py-1 rounded hover:bg-primary/20"
                >
                  {cat.role_categories.name}
                </Link>
              ))}
            </div>

            {/* Contact info (members only) */}
            {member ? (
              <div className="space-y-2 text-sm mb-6">
                {person.emails?.filter(Boolean).length > 0 && (
                  <div>
                    <span className="font-medium text-gray-600">Email: </span>
                    {person.emails.filter(Boolean).map((e: string, i: number) => (
                      <span key={i}>{i > 0 ? ', ' : ''}<a href={`mailto:${e}`}>{e}</a></span>
                    ))}
                  </div>
                )}
                {person.phones?.filter(Boolean).length > 0 && (
                  <div>
                    <span className="font-medium text-gray-600">Phone: </span>
                    {person.phones.filter(Boolean).join(' / ')}
                  </div>
                )}
                {person.linkedin && (
                  <div>
                    <a href={person.linkedin} target="_blank" rel="noopener noreferrer"
                      className="text-primary hover:underline">
                      LinkedIn Profile →
                    </a>
                  </div>
                )}
                {person.twitter && (
                  <div>
                    <a href={person.twitter} target="_blank" rel="noopener noreferrer"
                      className="text-primary hover:underline">
                      Twitter/X →
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <MemberGate message="Join to view this crew member's contact information and linked productions." />
            )}

            {/* Company affiliations */}
            {companyLinks.length > 0 && (
              <>
                <div className="pro-title">Company Affiliations:</div>
                <div className="space-y-2">
                  {companyLinks.map((cs: any) => (
                    <div key={cs.id} className="flex items-center gap-2 text-sm">
                      <Link href={`/production-contact/${cs.companies.slug}`} className="text-primary hover:underline">
                        {cs.companies.title}
                      </Link>
                      {cs.position && <span className="text-gray-500">— {cs.position}</span>}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Productions */}
            {roleLinks && roleLinks.length > 0 && (
              <>
                <div className="pro-title">Productions:</div>
                <div className="space-y-2">
                  {roleLinks.map((rl: any) => {
                    const prod = rl.productions
                    if (!prod) return null
                    return (
                      <div key={prod.id} className="flex items-center gap-2 text-sm">
                        <Link href={`/production/${prod.slug}`} className="text-primary hover:underline">
                          {prod.title}
                        </Link>
                        {prod.production_type_links?.[0]?.production_types && (
                          <span className="text-gray-400">
                            ({prod.production_type_links[0].production_types.name})
                          </span>
                        )}
                        <span className="text-gray-500">— {rl.role_name}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        <aside className="lg:w-64 flex-shrink-0">
          {!member && (
            <div className="white-bg p-4 text-center">
              <p className="text-sm text-gray-600 mb-3">Join to see contact info.</p>
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
