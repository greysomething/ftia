import Link from 'next/link'

export function Footer() {
  return (
    <footer className="bg-primary text-white mt-16">
      <div className="page-wrap py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-lg font-bold mb-4">Production List</h3>
            <p className="text-sm text-white/70 leading-relaxed">
              The Film &amp; Television Industry Alliance — your source for
              active productions in pre-production across North America and beyond.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-3 text-accent">Database</h4>
            <ul className="space-y-2 text-sm text-white/80">
              <li><Link href="/productions" className="hover:text-white">Productions</Link></li>
              <li><Link href="/production-contact" className="hover:text-white">Companies</Link></li>
              <li><Link href="/production-role" className="hover:text-white">Cast &amp; Crew</Link></li>
              <li><Link href="/production-list" className="hover:text-white">Production Lists</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-3 text-accent">Membership</h4>
            <ul className="space-y-2 text-sm text-white/80">
              <li><Link href="/membership-account/membership-levels" className="hover:text-white">Join Now</Link></li>
              <li><Link href="/membership-plans" className="hover:text-white">Pricing Plans</Link></li>
              <li><Link href="/membership-account" className="hover:text-white">My Account</Link></li>
              <li><Link href="/what-is-production-list" className="hover:text-white">About Us</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-3 text-accent">Resources</h4>
            <ul className="space-y-2 text-sm text-white/80">
              <li><Link href="/blog" className="hover:text-white">Production News</Link></li>
              <li><Link href="/production-resources" className="hover:text-white">Production Resources</Link></li>
              <li><Link href="/contact" className="hover:text-white">Contact Us</Link></li>
              <li><Link href="/terms-of-service" className="hover:text-white">Terms of Service</Link></li>
              <li><Link href="/privacy-policy" className="hover:text-white">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/20 mt-8 pt-8 flex flex-col md:flex-row items-center justify-between text-sm text-white/60">
          <p>© {new Date().getFullYear()} Production List. All rights reserved.</p>
          <p className="mt-2 md:mt-0">Film &amp; Television Industry Alliance</p>
        </div>
      </div>
    </footer>
  )
}
