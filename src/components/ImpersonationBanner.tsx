'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface ImpersonationData {
  adminName: string
  targetEmail: string
}

export default function ImpersonationBanner() {
  const [data, setData] = useState<ImpersonationData | null>(null)
  const [exiting, setExiting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Read the impersonation cookie
    const cookie = document.cookie
      .split('; ')
      .find((c) => c.startsWith('impersonating_from='))

    if (cookie) {
      try {
        const value = decodeURIComponent(cookie.split('=').slice(1).join('='))
        setData(JSON.parse(value))
      } catch { /* invalid cookie */ }
    }
  }, [])

  if (!data) return null

  async function exitImpersonation() {
    setExiting(true)
    try {
      await fetch('/api/admin/impersonate', { method: 'DELETE' })
      // Sign out the impersonated session
      const { createBrowserClient } = await import('@supabase/ssr')
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      await supabase.auth.signOut()
      router.push('/login')
    } catch {
      setExiting(false)
    }
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-white text-center py-2 px-4 text-sm font-medium shadow-md flex items-center justify-center gap-3">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
      <span>
        Viewing as <strong>{data.targetEmail}</strong>
        {data.adminName && <> (logged in as {data.adminName})</>}
      </span>
      <button
        onClick={exitImpersonation}
        disabled={exiting}
        className="ml-2 bg-white text-amber-700 px-3 py-1 rounded text-xs font-semibold hover:bg-amber-50 transition-colors disabled:opacity-50"
      >
        {exiting ? 'Exiting...' : 'Exit'}
      </button>
    </div>
  )
}
