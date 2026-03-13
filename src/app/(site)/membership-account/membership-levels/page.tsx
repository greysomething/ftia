import type { Metadata } from 'next'
import Link from 'next/link'
import { getMembershipLevels } from '@/lib/queries'
import { getUser } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Membership Plans | Production List',
  description:
    'Choose your Production List membership plan and get access to 1,500+ active film and TV productions.',
}

export default async function MembershipLevelsPage() {
  const levels = await getMembershipLevels()
  const user = await getUser()

  const featured = levels.find((l: any) => l.id === 1)
  const monthly = levels.find((l: any) => l.id === 3)
  const sixMonth = levels.find((l: any) => l.id === 2)
  const trial = levels.find((l: any) => l.id === 4)

  const displayLevels = [trial, monthly, sixMonth, featured].filter(Boolean)

  return (
    <div>
      {/* Hero Banner */}
      <section className="relative min-h-[250px] md:min-h-[300px] flex items-center justify-center text-white overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/images/hero-bg.jpg')" }}
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="page-wrap text-center relative z-10 py-12">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            Choose Your Membership Plan
          </h1>
          <p className="text-lg text-white/80 max-w-xl mx-auto">
            Get immediate access to 1,500+ active productions in pre-production.
            Find contacts, crew, and project details.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-12 md:py-16 bg-[#F5F5F5]">
        <div className="page-wrap">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            {displayLevels.map((level: any) => {
              if (!level) return null
              const isPopular = level.id === 1
              const perMonth =
                level.cycle_period === 'Year'
                  ? (level.billing_amount / 12).toFixed(2)
                  : level.billing_amount.toFixed(2)

              return (
                <div
                  key={level.id}
                  className={`bg-white rounded-lg shadow-sm border p-6 flex flex-col relative ${
                    isPopular ? 'ring-2 ring-accent border-accent' : 'border-gray-200'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-accent text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                        MOST POPULAR
                      </span>
                    </div>
                  )}

                  <h2 className="text-lg font-bold text-primary mb-1">{level.name}</h2>

                  <div className="my-4">
                    <span className="text-3xl font-bold text-gray-900">${perMonth}</span>
                    <span className="text-gray-500 text-sm">/mo</span>
                    {level.cycle_period === 'Year' && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Billed annually &mdash; ${level.billing_amount.toFixed(2)}/year
                      </p>
                    )}
                    {level.initial_payment !== level.billing_amount && (
                      <p className="text-xs text-accent font-medium mt-0.5">
                        First month: ${level.initial_payment.toFixed(2)}
                      </p>
                    )}
                  </div>

                  {level.description && (
                    <div
                      className="text-sm text-gray-600 mb-4 flex-1 prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: level.description }}
                    />
                  )}

                  <ul className="text-sm text-gray-600 space-y-2 mb-6 flex-1">
                    {[
                      'Full database access',
                      'Production contacts & crew',
                      'Shoot date & location info',
                      'Cancel anytime',
                    ].map((feat) => (
                      <li key={feat} className="flex items-center gap-2">
                        <span className="text-green-500">&#10003;</span>
                        {feat}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={
                      user
                        ? `/membership-account/membership-checkout?level=${level.id}`
                        : `/register?level=${level.id}`
                    }
                    className={`w-full text-center py-2.5 rounded-md font-medium transition-colors block ${
                      isPopular
                        ? 'bg-accent text-white hover:bg-accent-dark'
                        : 'bg-primary text-white hover:bg-primary-light'
                    }`}
                  >
                    Get Started
                  </Link>
                </div>
              )
            })}
          </div>

          <div className="text-center text-sm text-gray-500">
            <p>All plans include immediate access. Cancel anytime. Secure payment via Stripe.</p>
            <p className="mt-1">
              Questions?{' '}
              <Link href="/contact" className="text-primary hover:underline">
                Contact us
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* Why Join CTA */}
      <section className="bg-accent py-12 md:py-16">
        <div className="page-wrap text-center">
          <h2 className="text-2xl md:text-3xl font-normal text-white mb-4">
            Join 600+ industry professionals using Production List
          </h2>
          <p className="text-white/80 mb-6 max-w-xl mx-auto">
            Access weekly breakdowns of every major project in pre-production, plus daily
            alerts for the latest job announcements.
          </p>
          <Link
            href="/what-is-production-list"
            className="inline-flex items-center justify-center px-8 py-3 bg-white text-accent font-medium rounded-md border-2 border-white hover:bg-transparent hover:text-white transition-colors"
          >
            Learn More About FTIA
          </Link>
        </div>
      </section>
    </div>
  )
}
