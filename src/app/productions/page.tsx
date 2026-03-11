import type { Metadata } from 'next'
import { getProductions, getMembershipLevels } from '@/lib/queries'
import { getUser, isMember } from '@/lib/auth'
import { ProductionCard } from '@/components/ProductionCard'
import { Pagination } from '@/components/Pagination'
import { ProductionFilters } from '@/components/ProductionFilters'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Productions | Film & Television Database',
  description: 'Browse active film and TV productions in pre-production. Access contacts, crew, and shoot details.',
}

interface Props {
  searchParams: Promise<{ page?: string; type?: string; status?: string; s?: string }>
}

export default async function ProductionsPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)
  const user = await getUser()
  const member = user ? await isMember(user.id) : false

  const { productions, total, perPage } = await getProductions({
    page,
    search: params.s,
  })

  // Fetch filter options
  const supabase = await createClient()
  const [{ data: types }, { data: statuses }] = await Promise.all([
    supabase.from('production_types').select('id,name,slug').order('name'),
    supabase.from('production_statuses').select('id,name,slug').order('name'),
  ])

  return (
    <div className="page-wrap py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <aside className="lg:w-64 flex-shrink-0">
          <ProductionFilters types={types ?? []} statuses={statuses ?? []} />
        </aside>

        {/* Main content */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-primary">Productions</h1>
              <p className="text-sm text-gray-500 mt-1">
                {total.toLocaleString()} productions in the database
              </p>
            </div>
          </div>

          {!member && (
            <div className="mb-6 p-4 bg-accent/10 border border-accent/30 rounded-lg flex items-center justify-between gap-4">
              <p className="text-sm text-gray-700">
                <strong>Members</strong> get full access to contact details, crew info, and all listings.
              </p>
              <a href="/membership-account/membership-levels" className="btn-accent text-sm py-1.5 px-3 flex-shrink-0">
                Join Now
              </a>
            </div>
          )}

          {productions.length === 0 ? (
            <div className="white-bg p-12 text-center text-gray-500">
              No productions found. Try adjusting your filters.
            </div>
          ) : (
            <div className="space-y-3">
              {productions.map((p: any) => (
                <ProductionCard key={p.id} production={p} isMember={member} />
              ))}
            </div>
          )}

          <Pagination current={page} total={total} perPage={perPage} basePath="/productions" />
        </div>
      </div>
    </div>
  )
}
