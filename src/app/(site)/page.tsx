import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { getProductions, getBlogPosts } from '@/lib/queries'

export const metadata: Metadata = {
  title: 'Production List | Film & Television Industry Alliance',
  description:
    'Access 1,500+ active film and television productions in pre-production. Find contacts, crew, and project details.',
}

export default async function HomePage() {
  const [{ productions }, { posts: blogPosts }] = await Promise.all([
    getProductions({ page: 1 }).catch(() => ({ productions: [] })),
    getBlogPosts(1, { perPage: 4 }).catch(() => ({ posts: [], total: 0, page: 1, perPage: 4 })),
  ])

  return (
    <div>
      {/* Hero */}
      <section className="relative min-h-[500px] md:min-h-[600px] flex items-center justify-center text-white overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/images/hero-bg.jpg')" }}
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="page-wrap text-center relative z-10 py-20">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            Tracking Filmmaking Opportunities &amp;<br />Connecting Filmmakers Worldwide
          </h1>
          <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto">
            Monitoring all major film &amp; TV projects currently in pre-production
            across North America. Updated daily by our editorial team.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/membership-plans" className="btn-accent text-lg px-8 py-3">
              Get Started
            </Link>
            <Link
              href="/what-is-production-list"
              className="inline-flex items-center justify-center text-lg px-8 py-3 border border-white/40 text-white rounded-md hover:bg-white/10 transition-colors"
            >
              Learn More
            </Link>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-accent text-white py-4">
        <div className="page-wrap">
          <div className="flex flex-wrap justify-center items-center gap-6 text-sm font-semibold tracking-wide">
            <span className="flex items-center gap-2">
              <span className="text-xl font-bold">1,500+</span>
              <span className="text-white/90">Active Productions</span>
            </span>
            <span className="text-white/40 hidden sm:inline">|</span>
            <span className="flex items-center gap-2">
              <span className="text-xl font-bold">2,000+</span>
              <span className="text-white/90">Production Companies</span>
            </span>
            <span className="text-white/40 hidden sm:inline">|</span>
            <span className="flex items-center gap-2">
              <span className="text-xl font-bold">500+</span>
              <span className="text-white/90">Crew Listings</span>
            </span>
            <span className="text-white/40 hidden sm:inline">|</span>
            <span className="flex items-center gap-2">
              <span className="text-xl font-bold">Daily</span>
              <span className="text-white/90">Updates</span>
            </span>
          </div>
        </div>
      </section>

      {/* Member Network Logos */}
      <section className="py-10 bg-white border-b border-gray-100">
        <div className="page-wrap">
          <p className="text-center text-sm font-semibold text-gray-400 uppercase tracking-widest mb-6">
            Connecting with our member network
          </p>
          <div className="flex flex-wrap items-center justify-center gap-10 md:gap-14 opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-300">
            {[
              { name: 'Netflix', src: '/images/logos/netflix.svg', w: 110, h: 30 },
              { name: 'Disney+', src: '/images/logos/disney.svg', w: 90, h: 48 },
              { name: 'Max', src: '/images/logos/hbo.svg', w: 70, h: 30 },
              { name: 'ITV Studios', src: '/images/logos/itv-studios.svg', w: 70, h: 35 },
              { name: 'Paramount', src: '/images/logos/paramount.svg', w: 120, h: 30 },
              { name: 'Warner Bros', src: '/images/logos/warner-bros.svg', w: 140, h: 30 },
              { name: 'Lionsgate', src: '/images/logos/lionsgate.svg', w: 120, h: 30 },
              { name: 'Sony Pictures', src: '/images/logos/sony-pictures.svg', w: 100, h: 36 },
            ].map((logo) => (
              <Image
                key={logo.name}
                src={logo.src}
                alt={logo.name}
                width={logo.w}
                height={logo.h}
                className="h-7 md:h-8 w-auto object-contain"
              />
            ))}
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

      {/* Who Should Join? */}
      <section className="py-16 bg-gray-50">
        <div className="page-wrap text-center">
          <h2 className="text-3xl font-bold text-primary mb-3">Who Should Join?</h2>
          <p className="text-gray-500 mb-12 max-w-2xl mx-auto">
            Our membership connects film and television professionals at every level with the latest production opportunities.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 max-w-4xl mx-auto mb-10">
            {[
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                ),
                title: 'Film & TV Crew',
                desc: 'Find your next gig on set',
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                  </svg>
                ),
                title: 'Actors & Filmmakers',
                desc: 'Discover projects in development',
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
                  </svg>
                ),
                title: 'Pre & Post Professionals',
                desc: 'VFX, editing, sound & more',
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
                  </svg>
                ),
                title: 'Industry Vendors',
                desc: 'Catering, equipment, services',
              },
            ].map((item) => (
              <div key={item.title} className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-accent/10 text-accent flex items-center justify-center mb-3">
                  {item.icon}
                </div>
                <h3 className="font-semibold text-primary text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
          <Link href="/membership-plans" className="btn-accent text-lg px-8 py-3">
            Become a Member
          </Link>
        </div>
      </section>

      {/* 20+ Projects Weekly */}
      <section className="py-16 md:py-20 bg-white overflow-hidden">
        <div className="page-wrap">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4 leading-tight">
                We monitor &amp; publish <span className="text-accent">20+ new projects</span> weekly
              </h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Our editorial team tracks all major studios and production companies across North America,
                identifying new film and TV projects entering pre-production. Every week, we compile the
                most comprehensive breakdown of upcoming productions available anywhere.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  'Full project details & storyline synopses',
                  'Key contacts: producers, directors, casting',
                  'Shoot dates, locations & production status',
                  'Company info & production office details',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-gray-700">
                    <span className="text-accent font-bold mt-0.5">&#10003;</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/membership-plans" className="btn-primary text-lg px-8 py-3">
                Sign Up Today
              </Link>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-primary/5 to-accent/10 rounded-2xl p-6 md:p-8">
                <Image
                  src="/images/current-list-preview.png"
                  alt="Production List weekly preview"
                  width={600}
                  height={400}
                  className="rounded-lg shadow-lg w-full h-auto"
                />
              </div>
            </div>
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
                View All &rarr;
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
              <Link href="/membership-plans" className="btn-primary">
                Become a Member to Access All Listings
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Full-width Film Crew Photo */}
      <section className="relative h-[300px] md:h-[450px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/images/gallery-2.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/80 to-transparent" />
        <div className="page-wrap relative z-10 h-full flex items-center">
          <div className="max-w-lg text-white">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">
              Join the Alliance
            </h2>
            <p className="text-white/80 text-lg mb-6">
              Connect with thousands of film and television professionals worldwide.
              Your next opportunity starts here.
            </p>
            <Link href="/register?plan=free" className="inline-flex items-center justify-center px-6 py-3 bg-white !text-primary font-semibold rounded-md hover:bg-gray-100 transition-colors">
              Create Free Profile
            </Link>
          </div>
        </div>
      </section>

      {/* Project Alerts / Blog Posts */}
      {blogPosts.length > 0 && (
        <section className="py-16 bg-white">
          <div className="page-wrap">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-primary">Project Alerts</h2>
                <p className="text-sm text-gray-500 mt-1">Latest industry news and production announcements</p>
              </div>
              <Link href="/blog" className="text-primary hover:underline text-sm font-medium">
                View All News &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {blogPosts.slice(0, 4).map((post: any) => {
                // Build image URL: prefer production URL, fall back to storage path
                let featuredImage: string | null = null
                if (post.media?.original_url && post.media.original_url !== 'NULL') {
                  // Rewrite local WP URLs to production domain
                  featuredImage = post.media.original_url.replace(
                    'https://productionlist-wp-local.local/wp-content/uploads/',
                    'https://productionlist.com/wp-content/uploads/'
                  )
                } else if (post.media?.storage_path) {
                  featuredImage = `https://productionlist.com/wp-content/uploads/${post.media.storage_path}`
                }
                const altText = (post.media?.alt_text && post.media.alt_text !== 'NULL')
                  ? post.media.alt_text
                  : post.title
                return (
                  <Link
                    key={post.id}
                    href={`/blog/${post.slug}`}
                    className="group block bg-white rounded-lg overflow-hidden border border-gray-200 hover:shadow-md transition-shadow"
                  >
                    <div className="aspect-[16/10] overflow-hidden bg-gray-100">
                      {featuredImage ? (
                        <Image
                          src={featuredImage}
                          alt={altText}
                          width={400}
                          height={250}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/10">
                          <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-primary text-sm leading-snug line-clamp-2 group-hover:text-accent transition-colors">
                        {post.title}
                      </h3>
                      {post.published_at && (
                        <p className="text-xs text-gray-400 mt-2">
                          {new Date(post.published_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </p>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Photo Gallery Strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 h-[200px] md:h-[300px]">
        {[
          { src: '/images/gallery-1.jpg', alt: 'Studio set' },
          { src: '/images/gallery-3.jpg', alt: 'Film school' },
          { src: '/images/gallery-4.jpg', alt: 'Film production' },
          { src: '/images/gallery-2.jpg', alt: 'On-location filming' },
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

      {/* Pricing CTA */}
      <section className="py-16 bg-charcoal text-white">
        <div className="page-wrap text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Join the Alliance?</h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">
            Choose the plan that works for you. Cancel anytime. Immediate access to the full database.
          </p>
          <Link href="/membership-plans" className="btn-accent text-lg px-8 py-3">
            See Membership Plans
          </Link>
        </div>
      </section>
    </div>
  )
}
