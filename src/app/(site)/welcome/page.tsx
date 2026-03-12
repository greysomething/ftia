import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Welcome to Production List',
  robots: { index: false },
}

export default async function WelcomePage() {
  await requireAuth()

  return (
    <div className="page-wrap py-16 max-w-2xl mx-auto text-center">
      <div className="white-bg p-10">
        <div className="text-5xl mb-6">🎬</div>
        <h1 className="text-3xl font-bold text-primary mb-4">
          Welcome to Production List!
        </h1>
        <p className="text-gray-600 text-lg mb-4">
          Your membership is active. You now have full access to the production database, including contact details, crew information, and company profiles.
        </p>
        <p className="text-gray-500 mb-8">
          Explore thousands of film and TV productions, find key contacts, and stay ahead in the industry.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/productions" className="btn-primary">
            Browse Productions
          </Link>
          <Link href="/membership-account" className="btn-outline">
            My Account
          </Link>
        </div>
      </div>
    </div>
  )
}
