import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAdminBlogPostById } from '@/lib/admin-queries'
import { BlogPostForm } from '@/components/admin/forms/BlogPostForm'

export const metadata: Metadata = { title: 'Edit Post' }

interface Props { params: Promise<{ id: string }> }

export default async function EditBlogPostPage({ params }: Props) {
  const { id } = await params
  const post = await getAdminBlogPostById(Number(id)).catch(() => null)
  if (!post) notFound()

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Blog Post</h1>
      <BlogPostForm post={post} />
    </div>
  )
}
