import Link from 'next/link'

export function Footer() {
  return (
    <footer className="bg-charcoal text-white mt-16">
      <div className="page-wrap py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-lg font-bold mb-1">Production List</h3>
            <p className="text-xs text-accent uppercase tracking-widest mb-3">
              Film &amp; Television Industry Alliance
            </p>
            <p className="text-sm text-white/70 leading-relaxed">
              FTIA&apos;s Production List is the most comprehensive directory of
              active film and television productions in pre-production across
              North America. Updated daily by our editorial team, we help
              industry professionals find work and connect with the productions
              that are hiring.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-3 text-accent">Database</h4>
            <ul className="space-y-2 text-sm text-white/80">
              <li><Link href="/productions" className="hover:text-accent transition-colors">Productions</Link></li>
              <li><Link href="/production-contact" className="hover:text-accent transition-colors">Companies</Link></li>
              <li><Link href="/production-role" className="hover:text-accent transition-colors">Cast &amp; Crew</Link></li>
              <li><Link href="/production-list" className="hover:text-accent transition-colors">Production Lists</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-3 text-accent">Membership</h4>
            <ul className="space-y-2 text-sm text-white/80">
              <li><Link href="/membership-account/membership-levels" className="hover:text-accent transition-colors">Join Now</Link></li>
              <li><Link href="/membership-plans" className="hover:text-accent transition-colors">Pricing Plans</Link></li>
              <li><Link href="/membership-account" className="hover:text-accent transition-colors">My Account</Link></li>
              <li><Link href="/what-is-production-list" className="hover:text-accent transition-colors">About Us</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-3 text-accent">Resources</h4>
            <ul className="space-y-2 text-sm text-white/80">
              <li><Link href="/blog" className="hover:text-accent transition-colors">Production News</Link></li>
              <li><Link href="/production-resources" className="hover:text-accent transition-colors">Production Resources</Link></li>
              <li><Link href="/contact" className="hover:text-accent transition-colors">Contact Us</Link></li>
              <li><Link href="/terms-of-service" className="hover:text-accent transition-colors">Terms of Service</Link></li>
              <li><Link href="/privacy-policy" className="hover:text-accent transition-colors">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/20 mt-8 pt-8 flex flex-col md:flex-row items-center justify-between text-sm text-white/50">
          <p>© {new Date().getFullYear()} Production List / Film &amp; Television Industry Alliance. All rights reserved.</p>
          <p className="mt-2 md:mt-0">
            <Link href="/privacy-policy" className="hover:text-white transition-colors mr-4">Privacy</Link>
            <Link href="/terms-of-service" className="hover:text-white transition-colors">Terms</Link>
          </p>
        </div>
      </div>
    </footer>
  )
}
