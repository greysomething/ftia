import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'

export const metadata: Metadata = { title: 'Welcome to Production List!' }

export default async function ConfirmationPage() {
  await requireAuth()
  return (
    <div className="page-wrap py-16 text-center">
      <div className="max-w-md mx-auto white-bg p-8">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-primary mb-3">Welcome to Production List!</h1>
        <p className="text-gray-600 mb-6">
          Your membership is now active. You have full access to the production database.
        </p>
        <Link href="/productions" className="btn-primary">
          Start Browsing Productions →
        </Link>
      </div>
    </div>
  )
}
