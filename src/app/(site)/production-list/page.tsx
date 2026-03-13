import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { isMember } from '@/lib/auth'
import { getUser } from '@/lib/auth'
import Pagination from '@/components/Pagination'
import MemberGate from '@/components/MemberGate'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Production Lists | Production List',
  description: 'Curated production lists for the film and television industry.',
}

const PER_PAGE = 20

export default async function ProductionListArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10))
  const offset = (page - 1) * PER_PAGE

  const supabase = await createClient()
  const user = await getUser()
  const member = user ? await isMember(user.id) : false

  const { data: lists, count } = await supabase
    .from('production_lists')
    .select('id, title, slug, excerpt, created_at', { count: 'exact' })
    .eq('visibility', 'publish')
    .order('created_at', { ascending: false })
    .range(offset, offset + PER_PAGE - 1)

  const totalPages = Math.ceil((count ?? 0) / PER_PAGE)

  return (
    <div className="page-wrap py-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-primary mb-2">Production Lists</h1>
        <p className="text-gray-600 mb-8">Curated lists of productions for the film and TV industry.</p>

        {!member && (
          <div className="mb-8">
            <MemberGate />
          </div>
        )}

        {lists && lists.length > 0 ? (
          <div className="space-y-4">
            {lists.map((list) => (
              <div key={list.id} className="white-bg p-6">
                <h2 className="text-xl font-bold text-primary mb-2">
                  <Link
                    href={`/production-list/${list.slug}`}
                    className="hover:text-accent transition-colors"
                  >
                    {list.title}
                  </Link>
                </h2>
                {list.excerpt && (
                  <p className="text-gray-600 text-sm mb-3">{list.excerpt}</p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {new Date(list.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                  <Link
                    href={`/production-list/${list.slug}`}
                    className="text-sm text-accent font-medium hover:underline"
                  >
                    View List →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="white-bg p-8 text-center text-gray-500">
            No production lists found.
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-8">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              basePath="/production-list"
            />
          </div>
        )}
      </div>
    </div>
  )
}
