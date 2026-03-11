import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { MobileMenu } from './MobileMenu'
import { UserNav } from './UserNav'

export async function Header() {
  const user = await getUser()

  return (
    <header className="bg-primary text-white shadow-md sticky top-0 z-50">
      <div className="page-wrap">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 text-white hover:text-accent">
            <span className="text-xl font-bold tracking-tight">Production List</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
            <Link href="/productions" className="text-white/90 hover:text-white">
              Productions
            </Link>
            <Link href="/production-contact" className="text-white/90 hover:text-white">
              Companies
            </Link>
            <Link href="/production-role" className="text-white/90 hover:text-white">
              Crew
            </Link>
            <Link href="/blog" className="text-white/90 hover:text-white">
              News
            </Link>
            <Link href="/what-is-production-list" className="text-white/90 hover:text-white">
              About
            </Link>
          </nav>

          {/* Right side */}
          <div className="flex items-center space-x-3">
            {user ? (
              <UserNav user={user} />
            ) : (
              <>
                <Link href="/login" className="text-sm text-white/90 hover:text-white">
                  Login
                </Link>
                <Link href="/membership-account/membership-levels" className="btn-accent text-sm py-1.5 px-3">
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
