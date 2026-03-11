import type { Metadata } from 'next'
import Link from 'next/link'
import { getProductions } from '@/lib/queries'

export const metadata: Metadata = {
  title: 'Production List | Film & Television Industry Alliance',
  description:
    'Access 1,500+ active film and television productions in pre-production. Find contacts, crew, and project details.',
}

export default async function HomePage() {
  // Public visitors see the marketing homepage (logged-in users are redirected by middleware)
  const { productions } = await getProductions({ page: 1 }).catch(() => ({ productions: [] }))

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary to-primary-dark text-white py-20">
        <div className="page-wrap text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            The Film &amp; Television<br />Industry Alliance
          </h1>
          <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto">
            Access 1,500+ active productions in pre-production. Find contacts, crew, and project
            details for productions filming near you.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/membership-account/membership-levels" className="btn-accent text-lg px-8 py-3">
              Join Now — See Plans
            </Link>
            <Link href="/what-is-production-list" className="btn-outline border-white text-white hover:bg-white hover:text-primary text-lg px-8 py-3">
              Learn More
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 bg-white">
        <div className="page-wrap">
          <h2 className="text-3xl font-bold text-center text-primary mb-12">
            Everything You Need to Break Into Film
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: '🎬',
                title: 'Production Database',
                desc: 'Browse thousands of active productions — feature films, TV series, pilots — all with key contacts.',
              },
              {
                icon: '👥',
                title: 'Industry Contacts',
                desc: 'Direct access to producers, directors, casting directors, and production companies.',
              },
              {
                icon: '📋',
                title: 'Crew Listings',
                desc: 'Find every crew member attached to a production, with their role and contact details.',
              },
            ].map((f) => (
              <div key={f.title} className="text-center p-6">
                <div className="text-5xl mb-4">{f.icon}</div>
                <h3 className="text-xl font-semibold text-primary mb-3">{f.title}</h3>
                <p className="text-gray-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent Productions (teaser) */}
      {productions.length > 0 && (
        <section className="py-16 bg-gray-50">
          <div className="page-wrap">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-primary">Recent Productions</h2>
              <Link href="/login" className="text-primary hover:underline text-sm">
                View All →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {productions.slice(0, 6).map((p: any) => (
                <div key={p.id} className="white-bg p-4">
                  <p className="font-semibold text-primary blur-sm select-none">{p.title}</p>
                  <p className="text-sm text-gray-400 mt-1">Join to view full details</p>
                </div>
              ))}
            </div>
            <div className="text-center mt-8">
              <Link href="/membership-account/membership-levels" className="btn-primary">
                Become a Member to Access All Listings
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Pricing CTA */}
      <section className="py-16 bg-primary text-white">
        <div className="page-wrap text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Join the Alliance?</h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">
            Choose the plan that works for you. Cancel anytime. Immediate access to the full database.
          </p>
          <Link href="/membership-account/membership-levels" className="btn-accent text-lg px-8 py-3">
            See Membership Plans
          </Link>
        </div>
      </section>
    </div>
  )
}
