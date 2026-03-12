import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCompaniesByCategory } from '@/lib/queries'
import Link from 'next/link'
import { Pagination } from '@/components/Pagination'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const result = await getCompaniesByCategory(slug)
  if (!result) return { title: 'Not Found' }
  return {
    title: `${result.term.name} | Film Industry Companies`,
    description: `Browse ${result.term.name.toLowerCase()} companies in the film and television industry.`,
  }
}

export default async function CompanyCategoryPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const page = parseInt(sp.page ?? '1', 10)

  const result = await getCompaniesByCategory(slug, page)
  if (!result) notFound()

  return (
    <div className="page-wrap py-8">
      <h1 className="text-2xl font-bold text-primary mb-2">{result.term.name}</h1>
      <p className="text-sm text-gray-500 mb-6">{result.total.toLocaleString()} companies</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {result.companies.map((company: any) => (
          <div key={company.id} className="white-bg p-4">
            <Link href={`/production-contact/${company.slug}`} className="font-semibold text-primary hover:underline">
              {company.title}
            </Link>
          </div>
        ))}
      </div>

      <Pagination current={page} total={result.total} perPage={20} basePath={`/production-ccat/${slug}`} />
    </div>
  )
}
