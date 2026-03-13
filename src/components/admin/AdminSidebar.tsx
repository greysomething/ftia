'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

const NAV_ITEMS = [
  {
    href: '/admin',
    label: 'Overview',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/admin/productions',
    label: 'Productions',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
      </svg>
    ),
  },
  {
    href: '/admin/companies',
    label: 'Companies',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    href: '/admin/crew',
    label: 'Crew',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    href: '/admin/blog',
    label: 'Blog',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    ),
  },
  {
    href: '/admin/dnw-notices',
    label: 'DNW Notices',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
  },
  {
    href: '/admin/users',
    label: 'Users',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    href: '/admin/import',
    label: 'Import',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    ),
  },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const [viewMode, setViewMode] = useState<'member' | 'visitor'>('member')
  const [switching, setSwitching] = useState(false)

  // Read cookie on mount to set initial state
  useEffect(() => {
    const cookie = document.cookie.split('; ').find(c => c.startsWith('admin_view_as='))
    if (cookie?.split('=')[1] === 'visitor') {
      setViewMode('visitor')
    }
  }, [])

  async function toggleViewMode() {
    const newMode = viewMode === 'member' ? 'visitor' : 'member'
    setSwitching(true)
    try {
      await fetch('/api/admin/view-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      })
      setViewMode(newMode)
      // Open the public site in a new tab to preview
      if (newMode === 'visitor') {
        window.open('/productions', '_blank')
      }
    } finally {
      setSwitching(false)
    }
  }

  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  return (
    <aside
      className="w-64 flex-shrink-0 flex flex-col min-h-screen"
      style={{ backgroundColor: '#262626', color: '#ffffff' }}
    >
      {/* Logo */}
      <div className="px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <span className="text-base font-bold tracking-tight" style={{ color: '#ffffff' }}>
          Production List
        </span>
        <span className="block text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Admin Dashboard
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors"
            style={
              isActive(href)
                ? { backgroundColor: '#009BDE', color: '#ffffff' }
                : { color: 'rgba(255,255,255,0.7)' }
            }
            onMouseEnter={(e) => {
              if (!isActive(href)) {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'
                e.currentTarget.style.color = '#ffffff'
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive(href)) {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
              }
            }}
          >
            {icon}
            {label}
          </Link>
        ))}
      </nav>

      {/* View As Toggle */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="px-3 py-2">
          <span className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
            View Site As
          </span>
          <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.2)' }}>
            <button
              onClick={() => viewMode !== 'member' && toggleViewMode()}
              disabled={switching}
              className="flex-1 py-1.5 text-xs font-medium transition-colors"
              style={
                viewMode === 'member'
                  ? { backgroundColor: '#009BDE', color: '#ffffff' }
                  : { backgroundColor: 'transparent', color: 'rgba(255,255,255,0.6)' }
              }
            >
              Member
            </button>
            <button
              onClick={() => viewMode !== 'visitor' && toggleViewMode()}
              disabled={switching}
              className="flex-1 py-1.5 text-xs font-medium transition-colors"
              style={
                viewMode === 'visitor'
                  ? { backgroundColor: '#e97320', color: '#ffffff' }
                  : { backgroundColor: 'transparent', color: 'rgba(255,255,255,0.6)' }
              }
            >
              Visitor
            </button>
          </div>
          {viewMode === 'visitor' && (
            <p className="text-xs mt-1.5" style={{ color: '#e97320' }}>
              Viewing public site as non-member
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors"
          style={{ color: 'rgba(255,255,255,0.6)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'
            e.currentTarget.style.color = '#ffffff'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
          }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to site
        </Link>
      </div>
    </aside>
  )
}
