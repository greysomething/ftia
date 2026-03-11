'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'

export function MobileMenu({ user }: { user: User | null }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="text-white p-1 rounded"
        aria-label="Toggle menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {open && (
        <div className="absolute top-16 left-0 right-0 bg-primary shadow-lg z-50">
          <nav className="flex flex-col py-2">
            {[
              ['Productions', '/productions'],
              ['Companies', '/production-contact'],
              ['Crew', '/production-role'],
              ['News', '/blog'],
              ['About', '/what-is-production-list'],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="px-6 py-3 text-white/90 hover:text-white hover:bg-primary-light"
              >
                {label}
              </Link>
            ))}
            <div className="border-t border-white/20 mt-2 pt-2">
              {user ? (
                <>
                  <Link
                    href="/membership-account"
                    onClick={() => setOpen(false)}
                    className="px-6 py-3 text-white/90 hover:text-white block"
                  >
                    My Account
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="px-6 py-3 text-white/90 hover:text-white block"
                  >
                    Login
                  </Link>
                  <Link
                    href="/membership-account/membership-levels"
                    onClick={() => setOpen(false)}
                    className="px-6 py-3 text-accent font-semibold block"
                  >
                    Join Now
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </div>
  )
}
