import Link from 'next/link'

interface AdminTopBarProps {
  firstName?: string | null
  lastName?: string | null
  email: string
}

export function AdminTopBar({ firstName, lastName, email }: AdminTopBarProps) {
  const name = [firstName, lastName].filter(Boolean).join(' ') || email

  return (
    <header
      className="h-14 flex items-center justify-between px-6 flex-shrink-0 shadow-sm"
      style={{ backgroundColor: '#1a1a1a', borderBottom: '2px solid #009BDE' }}
    >
      <div className="flex items-center gap-4">
        <Link
          href="/admin"
          className="flex items-center gap-2 text-sm font-medium"
          style={{ color: '#009BDE' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Admin Panel
        </Link>
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
        <Link
          href="/"
          className="text-xs transition-colors"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          View Public Site
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>{name}</span>
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
          style={{ backgroundColor: '#009BDE', color: '#ffffff' }}
        >
          Admin
        </span>
      </div>
    </header>
  )
}
