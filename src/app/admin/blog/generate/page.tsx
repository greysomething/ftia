import type { Metadata } from 'next'
import { BlogGenerateWorkflow } from './BlogGenerateWorkflow'

export const metadata: Metadata = { title: 'AI Blog Generator' }

export default function BlogGeneratePage() {
  return <BlogGenerateWorkflow />
}
