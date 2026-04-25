import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { gatePublicPitchRoute } from '@/lib/pitch-marketplace-gate'

export const metadata: Metadata = {
  title: 'My Pitches | Production List',
}

export default async function MyPitchesPage() {
  await gatePublicPitchRoute()
  await requireAuth()

  return (
    <div className="page-wrap py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar nav */}
        <aside className="lg:w-56 flex-shrink-0">
          <nav className="white-bg p-4 space-y-1">
            {[
              ['My Account', '/membership-account'],
              ['My Pitches', '/membership-account/my-pitches'],
              ['My Submissions', '/membership-account/my-submissions'],
              ['Billing', '/membership-account/membership-billing'],
              ['Cancel', '/membership-account/membership-cancel'],
              ['Membership Plans', '/membership-plans'],
              ['Invoice', '/membership-account/membership-invoice'],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className={`block px-3 py-2 rounded text-sm ${
                  href === '/membership-account/my-pitches'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-gray-700 hover:bg-primary/10 hover:text-primary'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <div className="flex-1">
          <div className="white-bg p-6">
            <h1 className="text-2xl font-bold text-primary mb-4">My Pitches</h1>
            <div className="text-center py-16">
              <div className="text-5xl mb-4">🎬</div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Coming Soon</h2>
              <p className="text-gray-500 max-w-md mx-auto">
                The Pitch Marketplace is under development. Soon you&apos;ll be able to submit your film and TV concepts for producers to discover.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
