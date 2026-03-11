import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getProductionsByType } from '@/lib/queries'
import { ProductionCard } from '@/components/ProductionCard'
import { Pagination } from '@/components/Pagination'
import { getUser, isMember } from '@/lib/auth'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const result = await getProductionsByType(slug)
  if (!result) return { title: 'Not Found' }
  return {
    title: `${result.term.name} Productions`,
    description: `Browse ${result.term.name} productions currently in pre-production and development.`,
    alternates: { canonical: `/production-type/${slug}` },
  }
}

export default async function ProductionTypePage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const page = parseInt(sp.page ?? '1', 10)

  const result = await getProductionsByType(slug, page)
  if (!result) notFound()

  const user = await getUser()
  const member = user ? await isMember(user.id) : false

  return (
    <div className="page-wrap py-8">
      <h1 className="text-2xl font-bold text-primary mb-2">{result.term.name} Productions</h1>
      <p className="text-sm text-gray-500 mb-6">{result.total.toLocaleString()} productions</p>

      <div className="space-y-3">
        {result.productions.map((p: any) => (
          <ProductionCard key={p.id} production={p} isMember={member} />
        ))}
      </div>

      <Pagination current={page} total={result.total} perPage={20} basePath={`/production-type/${slug}`} />
    </div>
  )
}
