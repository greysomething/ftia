'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export function ViewToggle() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'weekly'

  function setView(v: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', v)
    params.delete('page')
    router.push(`/productions?${params.toString()}`)
  }

  const modes = [
    {
      key: 'browse',
      label: 'Browse',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      ),
    },
    {
      key: 'cards',
      label: 'Cards',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
      ),
    },
    {
      key: 'weekly',
      label: 'Weekly',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
  ] as const

  return (
    <div className="inline-flex items-center bg-white/10 backdrop-blur-sm rounded-lg p-0.5 border border-white/20">
      {modes.map((mode) => {
        const isActive = view === mode.key
        return (
          <button
            key={mode.key}
            onClick={() => setView(mode.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
              isActive
                ? 'bg-white text-[#1a2332] shadow-sm'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            {mode.icon}
            <span className="hidden sm:inline">{mode.label}</span>
          </button>
        )
      })}
    </div>
  )
}
