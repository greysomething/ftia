import Link from 'next/link'
import Image from 'next/image'
import { getUser, getUserProfile } from '@/lib/auth'
import { MobileMenu } from './MobileMenu'
import { UserNav } from './UserNav'

export async function Header() {
  const [user, profile] = await Promise.all([getUser(), getUserProfile()])
  const isAdmin = profile?.role === 'admin'

  return (
    <header className="bg-charcoal text-white shadow-md sticky top-0 z-50">
      <div className="page-wrap">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 text-white hover:text-accent transition-colors">
            <Image
              src="/images/pl-emblem.png"
              alt="PL"
              width={34}
              height={34}
              className="flex-shrink-0"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-lg font-bold tracking-tight">Production List</span>
              <span className="text-[10px] font-medium text-white/60 uppercase tracking-widest">
                Film &amp; Television Industry Alliance
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
            <Link href="/productions" className="text-white/90 hover:text-accent transition-colors">
              Productions
            </Link>
            <Link href="/production-contact" className="text-white/90 hover:text-accent transition-colors">
              Companies
            </Link>
            <Link href="/production-role" className="text-white/90 hover:text-accent transition-colors">
              Crew
            </Link>
            <Link href="/blog" className="text-white/90 hover:text-accent transition-colors">
              News
            </Link>
            {user && (
              <Link href="/do-not-work" className="text-white/90 hover:text-accent transition-colors">
                DNW Notices
              </Link>
            )}
            <Link href="/what-is-production-list" className="text-white/90 hover:text-accent transition-colors">
              About
            </Link>
          </nav>

          {/* Right side */}
          <div className="flex items-center space-x-3">
            {user ? (
              <UserNav user={user} isAdmin={isAdmin} />
            ) : (
              <>
                <Link href="/login" className="text-sm text-white/90 hover:text-white">
                  Login
                </Link>
                <Link href="/membership-plans" className="btn-accent text-sm py-1.5 px-3">
                  Join Now
                </Link>
              </>
            )}
            <MobileMenu user={user} />
          </div>
        </div>
      </div>
    </header>
  )
}
