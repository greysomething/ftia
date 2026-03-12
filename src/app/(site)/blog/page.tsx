import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { getBlogPosts } from '@/lib/queries'
import { Pagination } from '@/components/Pagination'
import { formatDate, getMediaUrl } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Production News | Film & Television Industry Updates',
  description: 'Latest news, casting calls, and job listings for the film and television industry.',
}

interface Props {
  searchParams: Promise<{ page?: string }>
}

export default async function BlogPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)
  const { posts, total, perPage } = await getBlogPosts(page)

  return (
    <div className="page-wrap py-8">
      <h1 className="text-3xl font-bold text-primary mb-8">Production News</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {posts.map((post: any) => (
          <article key={post.id} className="white-bg overflow-hidden hover:shadow-md transition-shadow">
            {post.media && (
              <div className="relative h-48 bg-gray-100">
                <img
                  src={getMediaUrl(post.media.storage_path, post.media.original_url)}
                  alt={post.media.alt_text ?? post.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="p-4">
              <div className="flex flex-wrap gap-1 mb-2">
                {post.blog_post_categories?.slice(0, 2).map((cat: any) => (
                  <Link
                    key={cat.blog_categories.id}
                    href={`/category/${cat.blog_categories.slug}`}
                    className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded"
                  >
                    {cat.blog_categories.name}
                  </Link>
                ))}
              </div>
              <h2 className="font-semibold text-gray-900 mb-2 leading-snug">
                <Link href={`/${post.slug}`} className="hover:text-primary">
                  {post.title}
                </Link>
              </h2>
              {post.excerpt && (
                <p
                  className="text-sm text-gray-500 line-clamp-3 mb-3"
                  dangerouslySetInnerHTML={{ __html: post.excerpt }}
                />
              )}
              <div className="flex items-center justify-between text-xs text-gray-400">
                <time>{formatDate(post.published_at)}</time>
                <Link href={`/${post.slug}`} className="text-primary hover:underline">
                  Read more →
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>

      <Pagination current={page} total={total} perPage={perPage} basePath="/blog" />
    </div>
  )
}
