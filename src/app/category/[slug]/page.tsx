import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getBlogPostsByCategory } from '@/lib/queries'
import { Pagination } from '@/components/Pagination'
import { formatDate } from '@/lib/utils'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const result = await getBlogPostsByCategory(slug)
  if (!result) return { title: 'Not Found' }
  return {
    title: `${result.category.name} | Production News`,
    description: result.category.description ?? `Articles about ${result.category.name} in the film industry.`,
  }
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const page = parseInt(sp.page ?? '1', 10)

  const result = await getBlogPostsByCategory(slug, page)
  if (!result) notFound()

  return (
    <div className="page-wrap py-8">
      <h1 className="text-2xl font-bold text-primary mb-2">{result.category.name}</h1>
      <p className="text-sm text-gray-500 mb-6">{result.total.toLocaleString()} articles</p>

      <div className="space-y-4">
        {result.posts.map((post: any) => (
          <div key={post.id} className="white-bg p-4">
            <Link href={`/${post.slug}`} className="font-semibold text-primary hover:underline block">
              {post.title}
            </Link>
            {post.excerpt && (
              <p className="text-sm text-gray-500 mt-1 line-clamp-2"
                dangerouslySetInnerHTML={{ __html: post.excerpt }} />
            )}
            <time className="text-xs text-gray-400 mt-1 block">{formatDate(post.published_at)}</time>
          </div>
        ))}
      </div>

      <Pagination current={page} total={result.total} perPage={20} basePath={`/category/${slug}`} />
    </div>
  )
}
