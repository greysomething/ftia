import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Membership Offers | Production List',
  description: 'Special membership offers for Production List. Join today and get access to the complete film and TV production database.',
}

export default function MembershipOffersPage() {
  return (
    <div className="page-wrap py-16">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="text-3xl font-bold text-primary mb-4">Special Membership Offers</h1>
        <p className="text-gray-600 text-lg mb-10">
          Join Production List today and get instant access to the most comprehensive film and TV production database in the US.
        </p>

        <div className="grid sm:grid-cols-2 gap-6 mb-10">
          {/* Annual offer */}
          <div className="white-bg p-8 border-2 border-accent relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-accent text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                Best Value
              </span>
            </div>
            <h2 className="text-xl font-bold text-primary mb-2">Annual Pro Plan</h2>
            <div className="mb-4">
              <span className="text-4xl font-bold text-primary">$38.95</span>
              <span className="text-gray-500">/month</span>
            </div>
            <p className="text-sm text-gray-500 mb-6">Billed $467.40/year — save 34%</p>
            <ul className="text-sm text-left space-y-2 mb-6">
              {[
                'Full production database access',
                'All contact details',
                'Company & crew profiles',
                'Unlimited searches',
                'Priority support',
              ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-accent">✓</span> {f}
                </li>
              ))}
            </ul>
            <Link href="/membership-account/membership-checkout?level=1" className="btn-primary w-full block text-center">
              Get Annual Plan
            </Link>
          </div>

          {/* Monthly offer */}
          <div className="white-bg p-8">
            <h2 className="text-xl font-bold text-primary mb-2">Monthly Plan</h2>
            <div className="mb-4">
              <span className="text-4xl font-bold text-primary">$58.95</span>
              <span className="text-gray-500">/month</span>
            </div>
            <p className="text-sm text-gray-500 mb-6">Billed monthly — cancel any time</p>
            <ul className="text-sm text-left space-y-2 mb-6">
              {[
                'Full production database access',
                'All contact details',
                'Company & crew profiles',
                'Unlimited searches',
                'Email support',
              ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-accent">✓</span> {f}
                </li>
              ))}
            </ul>
            <Link href="/membership-account/membership-checkout?level=3" className="btn-outline w-full block text-center">
              Get Monthly Plan
            </Link>
          </div>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Not sure? Start with our{' '}
          <Link href="/membership-account/membership-checkout?level=4" className="text-accent underline">
            1-Month Trial for $29.95
          </Link>
          .
        </p>

        <p className="text-sm text-gray-500">
          <Link href="/membership-plans" className="text-primary hover:underline">
            View all membership options →
          </Link>
        </p>
      </div>
    </div>
  )
}
