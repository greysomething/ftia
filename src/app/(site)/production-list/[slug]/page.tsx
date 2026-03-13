import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getUser, isMember } from '@/lib/auth'
import ProductionCard from '@/components/ProductionCard'
import MemberGate from '@/components/MemberGate'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('production_lists')
    .select('title, excerpt')
    .eq('slug', slug)
    .single()

  if (!data) return { title: 'Not Found' }
  return {
    title: `${data.title} | Production List`,
    description: data.excerpt ?? undefined,
  }
}

export async function generateStaticParams() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('production_lists')
    .select('slug')
    .eq('visibility', 'publish')
  return (data ?? []).map((r) => ({ slug: r.slug }))
}

export default async function ProductionListDetailPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: list } = await supabase
    .from('production_lists')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!list) notFound()

  const user = await getUser()
  const member = user ? await isMember(user.id) : false

  // Fetch productions linked to this list
  const { data: linkedProductions } = await supabase
    .from('productions')
    .select(`
      id, title, slug, created_at, visibility,
      production_type_links(production_types(name, slug)),
      production_status_links(production_statuses(name, slug)),
      production_locations(location_text)
    `)
    .eq('list_id', list.id)
    .eq('visibility', 'publish')
    .order('title')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: list.title,
    description: list.excerpt,
    url: `https://productionlist.com/production-list/${slug}`,
    numberOfItems: linkedProductions?.length ?? 0,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="page-wrap py-10">
        <div className="max-w-5xl mx-auto">
          {/* Breadcrumb */}
          <nav className="text-sm text-gray-500 mb-6">
            <Link href="/production-list" className="hover:text-primary">
              Production Lists
            </Link>
            <span className="mx-2">/</span>
            <span className="text-gray-700">{list.title}</span>
          </nav>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-primary mb-3">{list.title}</h1>
            {list.excerpt && (
              <p className="text-gray-600 text-lg">{list.excerpt}</p>
            )}
            {list.content && (
              <div
                className="mt-4 prose max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: list.content }}
              />
            )}
          </div>

          {!member && (
            <div className="mb-8">
              <MemberGate />
            </div>
          )}

          {linkedProductions && linkedProductions.length > 0 ? (
            <>
              <p className="text-sm text-gray-500 mb-4">
                {linkedProductions.length} production{linkedProductions.length !== 1 ? 's' : ''} in this list
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {linkedProductions.map((production: any) => (
                  <ProductionCard
                    key={production.id}
                    production={production}
                    isMember={member}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="white-bg p-8 text-center text-gray-500">
              No productions in this list yet.
            </div>
          )}
        </div>
      </div>
    </>
  )
}
