import type { Metadata } from 'next'
import { BlogPostForm } from '@/components/admin/forms/BlogPostForm'

export const metadata: Metadata = { title: 'New Post' }

export default function NewBlogPostPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Blog Post</h1>
      <BlogPostForm />
    </div>
  )
}
