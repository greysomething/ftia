import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Pagination } from '@/components/Pagination'

export const metadata: Metadata = {
  title: 'Production Companies | Film & TV Industry Contacts',
  description: 'Browse production companies, studios, distributors and casting agencies in the film and television industry.',
}

interface Props {
  searchParams: Promise<{ page?: string; s?: string }>
}

const PER_PAGE = 30

export default async function CompaniesArchive({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)
  const from = (page - 1) * PER_PAGE

  const supabase = await createClient()
  let query = supabase
    .from('companies')
    .select(
      'id,title,slug,company_category_links(company_categories(name,slug))',
      { count: 'exact' }
    )
    .eq('visibility', 'publish')
    .order('title')
    .range(from, from + PER_PAGE - 1)

  if (params.s) {
    query = query.ilike('title', `%${params.s}%`)
  }

  const { data: companies, count } = await query

  const { data: categories } = await supabase
    .from('company_categories')
    .select('id,name,slug')
    .order('name')

  return (
    <div className="page-wrap py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="lg:w-64 flex-shrink-0">
          <div className="white-bg p-4">
            <h3 className="font-semibold text-primary mb-3 text-sm uppercase">Company Type</h3>
            <Link href="/production-contact" className="block text-sm text-gray-600 hover:text-primary py-1">
              All Companies
            </Link>
            {categories?.map((cat) => (
              <Link
                key={cat.id}
                href={`/production-ccat/${cat.slug}`}
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
              <h1 className="text-2xl font-bold text-primary">Production Companies</h1>
              <p className="text-sm text-gray-500 mt-1">{(count ?? 0).toLocaleString()} companies</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {companies?.map((company: any) => (
              <div key={company.id} className="white-bg p-4">
                <Link href={`/production-contact/${company.slug}`} className="font-semibold text-primary hover:underline block">
                  {company.title}
                </Link>
                <div className="flex flex-wrap gap-1 mt-1">
                  {company.company_category_links?.slice(0, 2).map((cat: any) => (
                    <span key={cat.company_categories.id} className="text-xs text-gray-400">
                      {cat.company_categories.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Pagination current={page} total={count ?? 0} perPage={PER_PAGE} basePath="/production-contact" />
        </div>
      </div>
    </div>
  )
}
