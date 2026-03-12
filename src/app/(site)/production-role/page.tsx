import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Pagination } from '@/components/Pagination'

export const metadata: Metadata = {
  title: 'Cast & Crew | Film & TV Industry Professionals',
  description: 'Browse producers, directors, casting executives and crew members in the film and television industry.',
}

interface Props {
  searchParams: Promise<{ page?: string; s?: string }>
}

const PER_PAGE = 30

export default async function CrewArchive({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)
  const from = (page - 1) * PER_PAGE

  const supabase = await createClient()
  let query = supabase
    .from('crew_members')
    .select('id,name,slug,linkedin,crew_category_links(role_categories(name,slug))', { count: 'exact' })
    .eq('visibility', 'publish')
    .order('name')
    .range(from, from + PER_PAGE - 1)

  if (params.s) {
    query = query.ilike('name', `%${params.s}%`)
  }

  const { data: crew, count } = await query
  const { data: categories } = await supabase.from('role_categories').select('id,name,slug').order('name')

  return (
    <div className="page-wrap py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="lg:w-64 flex-shrink-0">
          <div className="white-bg p-4">
            <h3 className="font-semibold text-primary mb-3 text-sm uppercase">Role Type</h3>
            <Link href="/production-role" className="block text-sm text-gray-600 hover:text-primary py-1">
              All Roles
            </Link>
            {categories?.map((cat) => (
              <Link
                key={cat.id}
                href={`/production-rcat/${cat.slug}`}
                className="block text-sm text-gray-600 hover:text-primary py-1"
              >
                {cat.name}
              </Link>
            ))}
          </div>
        </aside>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-primary">Cast &amp; Crew</h1>
              <p className="text-sm text-gray-500 mt-1">{(count ?? 0).toLocaleString()} industry professionals</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {crew?.map((person: any) => (
              <div key={person.id} className="white-bg p-3">
                <Link href={`/production-role/${person.slug}`} className="font-semibold text-primary hover:underline block">
                  {person.name}
                </Link>
                <div className="flex flex-wrap gap-1 mt-1">
                  {person.crew_category_links?.slice(0, 2).map((cat: any) => (
                    <span key={cat.role_categories.id} className="text-xs text-gray-400">
                      {cat.role_categories.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Pagination current={page} total={count ?? 0} perPage={PER_PAGE} basePath="/production-role" />
        </div>
      </div>
    </div>
  )
}
