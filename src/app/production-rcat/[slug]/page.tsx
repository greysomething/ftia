import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCrewByCategory } from '@/lib/queries'
import Link from 'next/link'
import { Pagination } from '@/components/Pagination'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const result = await getCrewByCategory(slug)
  if (!result) return { title: 'Not Found' }
  return {
    title: `${result.term.name}s | Film & TV Industry Professionals`,
    description: `Browse ${result.term.name}s in the film and television industry.`,
  }
}

export default async function RoleCategoryPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const page = parseInt(sp.page ?? '1', 10)

  const result = await getCrewByCategory(slug, page)
  if (!result) notFound()

  return (
    <div className="page-wrap py-8">
      <h1 className="text-2xl font-bold text-primary mb-2">{result.term.name}s</h1>
      <p className="text-sm text-gray-500 mb-6">{result.total.toLocaleString()} professionals</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {result.crew.map((person: any) => (
          <div key={person.id} className="white-bg p-3">
            <Link href={`/production-role/${person.slug}`} className="font-semibold text-primary hover:underline">
              {person.name}
            </Link>
          </div>
        ))}
      </div>

      <Pagination current={page} total={result.total} perPage={20} basePath={`/production-rcat/${slug}`} />
    </div>
  )
}
