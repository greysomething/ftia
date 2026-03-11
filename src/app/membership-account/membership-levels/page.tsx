import type { Metadata } from 'next'
import Link from 'next/link'
import { getMembershipLevels } from '@/lib/queries'
import { getUser } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Membership Plans | Production List',
  description: 'Choose your Production List membership plan and get access to 1,500+ active film and TV productions.',
}

export default async function MembershipLevelsPage() {
  const levels = await getMembershipLevels()
  const user = await getUser()

  const featured = levels.find((l) => l.id === 1) // Annual Pro = most popular
  const monthly = levels.find((l) => l.id === 3)
  const sixMonth = levels.find((l) => l.id === 2)
  const trial = levels.find((l) => l.id === 4)

  const displayLevels = [trial, monthly, sixMonth, featured].filter(Boolean)

  return (
    <div className="page-wrap py-12">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-primary mb-3">Choose Your Membership Plan</h1>
        <p className="text-gray-600 max-w-xl mx-auto">
          Get immediate access to 1,500+ active productions in pre-production.
          Find contacts, crew, and project details for productions filming near you.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {displayLevels.map((level) => {
          if (!level) return null
          const isPopular = level.id === 1
          const perMonth = level.cycle_period === 'Year'
            ? (level.billing_amount / 12).toFixed(2)
            : level.billing_amount.toFixed(2)

          return (
            <div
              key={level.id}
              className={`white-bg p-6 flex flex-col relative ${isPopular ? 'ring-2 ring-accent' : ''}`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-accent text-white text-xs font-bold px-3 py-1 rounded-full">
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
                    Billed annually — ${level.billing_amount.toFixed(2)}/year
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
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Full database access
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Production contacts &amp; crew
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Shoot date &amp; location info
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Cancel anytime
                </li>
              </ul>

              <Link
                href={user ? `/membership-account/membership-checkout?level=${level.id}` : `/register?level=${level.id}`}
                className={`w-full text-center py-2.5 rounded-md font-medium transition-colors ${
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
        <p className="mt-1">Questions? <Link href="/contact" className="text-primary hover:underline">Contact us</Link></p>
      </div>
    </div>
  )
}
