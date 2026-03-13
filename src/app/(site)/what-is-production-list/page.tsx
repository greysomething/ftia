import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { getMembershipLevels } from '@/lib/queries'
import { getUser } from '@/lib/auth'
import { SignUpModalProvider, SignUpTriggerButton } from '@/components/SignUpModal'

export const metadata: Metadata = {
  title: 'What is Production List? | Production List',
  description:
    'Production List is the film and TV industry\'s production tracking service. Discover filmmaking opportunities, find contacts, and connect with decision-makers.',
}

export default async function WhatIsProductionListPage() {
  const levels = await getMembershipLevels()
  const user = await getUser()

  const featured = levels.find((l: any) => l.id === 1)
  const monthly = levels.find((l: any) => l.id === 3)
  const sixMonth = levels.find((l: any) => l.id === 2)
  const displayLevels = [monthly, sixMonth, featured].filter(Boolean)

  return (
    <SignUpModalProvider>
      <div>
        {/* Hero */}
        <section className="relative min-h-[400px] md:min-h-[450px] flex items-center justify-center text-white overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: "url('/images/about-hero.jpg')" }}
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

        {/* What is productionlist.com? */}
        <section className="bg-[#F5F5F5] py-16 md:py-20">
          <div className="max-w-[900px] mx-auto px-4 text-center">
            <h2 className="text-[30px] font-semibold text-gray-900 mb-4">
              What is productionlist.com?
            </h2>
            <p className="text-gray-700 leading-relaxed mb-6 max-w-3xl mx-auto">
              Productionlist.com is film and TV&apos;s production tracking service, offered by the
              Film &amp; Television Industry Alliance. Our office works with major film and TV studios
              tracking pre-production announcements of roughly 20 to 40 new projects weekly. Our
              members have access to the industry&apos;s most comprehensive database of production
              contacts and receive weekly and daily production job announcements.
            </p>
            <SignUpTriggerButton className="text-accent hover:text-accent-dark font-normal text-lg transition-colors cursor-pointer">
              Become a member today &rsaquo;
            </SignUpTriggerButton>
          </div>
        </section>

        {/* Video Section */}
        <section className="bg-[#F5F5F5] pb-16 md:pb-20">
          <div className="max-w-[850px] mx-auto px-4">
            <div className="shadow-lg rounded-lg overflow-hidden bg-black">
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src="https://player.vimeo.com/video/201353375?title=0&portrait=0&byline=0&dnt=1"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  title="Production List Introduction"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="bg-white py-16 md:py-20">
          <div className="max-w-[900px] mx-auto px-4">
            <h2 className="text-[30px] font-semibold text-gray-900 text-center mb-10">
              Get access to productionlist.com
            </h2>

            <div className="grid md:grid-cols-2 gap-8 items-start">
              {/* Left: Text + Benefits */}
              <div>
                <p className="text-gray-700 text-lg leading-[30px] mb-6">
                  When you become a member, there are two ways to get the latest production
                  announcements from FTIA. Our members get access to weekly breakdowns of every
                  major project currently in pre-production. In addition, we send out daily project
                  alerts highlighting latest job announcements and gigs, immediately after they are
                  posted to our database.
                </p>

                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  When you join FTIA, you will immediately have access to:
                </h3>

                <ul className="space-y-3">
                  {[
                    'The latest productions ASAP',
                    'What positions the producers have yet to fill',
                    'Exactly who you should contact',
                    'And how to contact them',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-lg text-gray-700">
                      <span className="text-yellow-500 mt-0.5">&#10003;</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right: Product Image (transparent PNG) */}
              <div className="flex justify-center">
                <Image
                  src="/images/current-list-preview.png"
                  alt="Production List Preview"
                  width={450}
                  height={467}
                  className="drop-shadow-lg"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Sign Up CTA */}
        <section className="bg-white pb-12 md:pb-16">
          <div className="text-center">
            <SignUpTriggerButton className="inline-flex items-center justify-center px-10 py-4 bg-accent text-white text-lg font-normal rounded-md hover:bg-accent-dark transition-colors cursor-pointer">
              Sign Up Today
            </SignUpTriggerButton>
          </div>
        </section>

        {/* Membership Plans with Pricing Cards */}
        <section className="bg-[#F5F5F5] py-16 md:py-20">
          <div className="max-w-[1140px] mx-auto px-4 text-center">
            <h2 className="text-[30px] font-semibold text-gray-900 mb-4">
              Membership Plans
            </h2>
            <p className="text-gray-700 leading-relaxed mb-10 max-w-3xl mx-auto">
              Become a member and start receiving weekly breakdowns with contact information to
              major film &amp; TV projects currently in pre-production. Our plans are designed to
              offer savings when you sign up for a 6-month or the annual plan.
            </p>

            {/* Pricing Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-8">
              {displayLevels.map((level: any) => {
                if (!level) return null
                const isPopular = level.id === 1
                const perMonth =
                  level.cycle_period === 'Year'
                    ? (level.billing_amount / 12).toFixed(2)
                    : level.cycle_period === 'Month' && level.cycle_number === 6
                      ? (level.billing_amount / 6).toFixed(2)
                      : level.billing_amount.toFixed(2)

                const billingLabel =
                  level.cycle_period === 'Year'
                    ? `12-months discounted at $${perMonth}/mo (billed annually)`
                    : level.cycle_period === 'Month' && level.cycle_number === 6
                      ? `6-months discounted at $${perMonth}/mo (billed semiannually)`
                      : `Regular membership dues of just $${level.billing_amount.toFixed(2)} per month`

                return (
                  <div
                    key={level.id}
                    className={`bg-white rounded-lg border p-8 flex flex-col relative ${
                      isPopular ? 'border-accent' : 'border-gray-200'
                    }`}
                  >
                    <h3 className="text-lg font-bold text-gray-900 mb-4">{level.name}</h3>

                    <div className="mb-4">
                      <span className="text-5xl font-bold text-gray-900">${perMonth}</span>
                      <span className="text-gray-500 text-lg">/mo</span>
                    </div>

                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-6 leading-snug">
                      {billingLabel}
                    </p>

                    <Link
                      href={
                        user
                          ? `/membership-account/membership-checkout?level=${level.id}`
                          : `/register?level=${level.id}`
                      }
                      className="w-full text-center py-3 rounded-md font-medium transition-colors block bg-accent text-white hover:bg-accent-dark"
                    >
                      Select
                    </Link>

                    {isPopular && (
                      <div className="mt-4 flex justify-center">
                        <span className="bg-accent text-white text-xs font-bold px-4 py-1.5 rounded-sm">
                          Most Popular Plan: SAVE 40%
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="bg-white py-16 md:py-20">
          <div className="max-w-[900px] mx-auto px-4">
            <h2 className="text-[30px] font-semibold text-gray-900 text-center mb-3">
              Trusted by <span className="text-accent">600+</span> Industry Professionals
            </h2>
            <p className="text-gray-700 leading-relaxed text-center mb-12 max-w-3xl mx-auto">
              Want to be among the handful of industry professionals who have access to production
              offices of major film, television, and digital media projects? No matter your
              experience level, the Film &amp; Television Industry Alliance is dedicated to
              providing you with the resources you&apos;ll need to find your next big budget
              film or TV job.
            </p>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Testimonial 1 */}
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <Image
                    src="/images/testimonial-tyler.jpg"
                    alt="Tyler Flemming"
                    width={100}
                    height={100}
                    className="rounded-full object-cover"
                  />
                </div>
                <div className="flex justify-center mb-3">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-6 h-6 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <h3 className="text-xl font-medium text-gray-900 mb-1">Tyler Flemming</h3>
                <p className="text-gray-500 italic text-sm">
                  &ldquo;If you work in film and television, you should know about production list&hellip;&rdquo;
                </p>
              </div>

              {/* Testimonial 2 */}
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <Image
                    src="/images/testimonial-jennifer.jpg"
                    alt="Jennifer Furches"
                    width={100}
                    height={100}
                    className="rounded-full object-cover"
                  />
                </div>
                <div className="flex justify-center mb-3">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-6 h-6 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <h3 className="text-xl font-medium text-gray-900 mb-1">Jennifer Furches</h3>
                <p className="text-gray-500 italic text-sm">
                  &ldquo;I landed a couple of film jobs that I wouldn&apos;t have known about otherwise.&rdquo;
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="bg-accent py-16 md:py-20">
          <div className="page-wrap text-center">
            <h2 className="text-[30px] md:text-[30px] font-normal text-white mb-6">
              Start discovering filmmaking opportunities today!
            </h2>
            <SignUpTriggerButton className="inline-flex items-center justify-center px-10 py-4 bg-white text-accent text-lg font-normal rounded-md border-[3px] border-white hover:bg-transparent hover:text-white transition-colors cursor-pointer">
              Get Access Now
            </SignUpTriggerButton>
          </div>
        </section>
      </div>
    </SignUpModalProvider>
  )
}
