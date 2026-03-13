import Link from 'next/link'
import type { Metadata } from 'next'
import { getMembershipLevels } from '@/lib/queries'
import { getUser } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Membership Plans | Production List',
  description:
    'Choose your Production List membership plan. Get immediate access to the weekly production list with film & TV project announcements.',
}

export default async function MembershipPlansPage() {
  const levels = await getMembershipLevels()
  const user = await getUser()

  const featured = levels.find((l: any) => l.id === 1)
  const monthly = levels.find((l: any) => l.id === 3)
  const sixMonth = levels.find((l: any) => l.id === 2)
  const displayLevels = [monthly, sixMonth, featured].filter(Boolean)

  return (
    <div>
      {/* Hero */}
      <section className="relative min-h-[350px] md:min-h-[400px] flex items-center justify-center text-white overflow-hidden hidden md:flex">
        <div
          className="absolute inset-0 bg-cover bg-top bg-no-repeat"
          style={{ backgroundImage: "url('/images/membership-hero.jpg')" }}
        />
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(67, 183, 240, 0.66)' }} />
        <div className="page-wrap text-center relative z-10 py-16">
          <h1 className="text-4xl md:text-[55px] font-medium mb-4 leading-tight">
            Discover Filmmaking Opportunities
          </h1>
          <p className="text-xl md:text-2xl font-light text-white/90 max-w-2xl mx-auto">
            Tracking all major film &amp; TV projects currently in pre-production.
          </p>
        </div>
      </section>

      {/* Progress / Select Plan */}
      <section className="bg-[#F5F5F5] pt-12 md:pt-14 pb-4">
        <div className="max-w-[600px] mx-auto px-4 text-center">
          <h2 className="text-[30px] font-semibold text-gray-900 mb-3">
            Select your plan&hellip;
          </h2>
          {/* Progress bar */}
          <div className="mb-2">
            <div className="w-full bg-gray-300 rounded h-3.5 overflow-hidden">
              <div
                className="h-full rounded"
                style={{ width: '66%', backgroundColor: '#80D4FF' }}
              />
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">Step 2 of 3</p>
        </div>
      </section>

      {/* Plans Description + Pricing Cards */}
      <section className="bg-[#F5F5F5] pb-16">
        <div className="max-w-[1140px] mx-auto px-4">
          <p className="text-gray-700 leading-relaxed text-center mb-10 max-w-3xl mx-auto">
            Get immediate access to our weekly production list with the latest film &amp; TV
            project announcements. Major studios &amp; TV companies release an average of 20 to
            40 NEW projects into pre-production on a weekly basis. Our membership plans are
            designed to offer savings when you sign up for a 6-month or the annual plan.
          </p>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-8">
            {displayLevels.map((level: any) => {
              if (!level) return null
              const isPopular = level.id === 1
              const perMonth =
                level.cycle_period === 'Year'
                  ? (level.billing_amount / 12).toFixed(2)
                  : level.cycle_number > 1
                    ? (level.billing_amount / level.cycle_number).toFixed(2)
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

                  <h3 className="text-lg font-bold text-primary mb-1">{level.name}</h3>

                  <div className="my-4">
                    <span className="text-3xl font-bold text-gray-900">${perMonth}</span>
                    <span className="text-gray-500 text-sm">/mo</span>
                    {level.cycle_period === 'Year' && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Billed annually &mdash; ${level.billing_amount.toFixed(2)}/year
                      </p>
                    )}
                    {level.cycle_period === 'Month' && level.cycle_number > 1 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Billed every {level.cycle_number} months &mdash; ${level.billing_amount.toFixed(2)}
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
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="bg-white py-16 md:py-20">
        <div className="max-w-[900px] mx-auto px-4">
          <h2 className="text-[30px] font-semibold text-gray-900 text-center mb-10">
            Frequently Asked Questions
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Why should I join FTIA?
              </h3>
              <p className="text-gray-700 leading-relaxed text-sm">
                Film and TV professionals all over the world use FTIA&apos;s production list to
                quickly identify and connect with often hard-to-reach decision makers behind
                major projects shooting in principal markets and around the world. We offer the
                world&apos;s largest pre-production database and publish the most comprehensive
                weekly breakdown of all upcoming film and TV projects.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Do you track projects in my country?
              </h3>
              <p className="text-gray-700 leading-relaxed text-sm">
                Film and TV professionals all over the world use FTIA&apos;s production list to
                quickly identify and connect with often hard-to-reach decision makers behind
                major projects shooting in principal markets and around the world. We offer the
                world&apos;s largest pre-production database and publish the most comprehensive
                weekly breakdown of all upcoming film and TV projects.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                What&apos;s included with my membership?
              </h3>
              <p className="text-gray-700 leading-relaxed text-sm">
                Film and TV professionals all over the world use FTIA&apos;s production list to
                quickly identify and connect with often hard-to-reach decision makers behind
                major projects shooting in principal markets and around the world. We offer the
                world&apos;s largest pre-production database and publish the most comprehensive
                weekly breakdown of all upcoming film and TV projects.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Photo Gallery Strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 h-[300px] md:h-[500px]">
        {[
          { src: '/images/gallery-1.jpg', alt: 'Studio set' },
          { src: '/images/gallery-2.jpg', alt: 'On-location filming' },
          { src: '/images/gallery-3.jpg', alt: 'Film school' },
          { src: '/images/gallery-4.jpg', alt: 'Film production' },
        ].map((img) => (
          <div
            key={img.src}
            className="bg-cover bg-center"
            style={{ backgroundImage: `url('${img.src}')` }}
            role="img"
            aria-label={img.alt}
          />
        ))}
      </section>
    </div>
  )
}
