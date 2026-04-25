'use client'

import { useState, useTransition } from 'react'

interface Props {
  pitchId: number
  initialFavorited: boolean
}

export function PitchFavoriteButton({ pitchId, initialFavorited }: Props) {
  const [favorited, setFavorited] = useState(initialFavorited)
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    const action = favorited ? 'remove' : 'add'
    startTransition(async () => {
      try {
        const res = await fetch('/api/pitch-favorite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pitchId, action }),
        })
        if (res.ok) {
          setFavorited(!favorited)
        }
      } catch {
        // Silently fail — user can retry
      }
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`p-2 rounded-full transition-colors ${
        favorited
          ? 'text-red-500 hover:text-red-600 hover:bg-red-50'
          : 'text-gray-400 hover:text-red-400 hover:bg-gray-100'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
    >
      <svg
        className="w-5 h-5"
        fill={favorited ? 'currentColor' : 'none'}
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
    </button>
  )
}

export default PitchFavoriteButton
