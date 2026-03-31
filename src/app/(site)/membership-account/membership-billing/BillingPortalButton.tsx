'use client'

import { useState } from 'react'

export function BillingPortalButton({
  label,
  variant = 'link',
}: {
  label: string
  variant?: 'link' | 'outline'
}) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/billing-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_url: window.location.href }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || 'Unable to open billing portal')
        setLoading(false)
      }
    } catch {
      alert('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  if (variant === 'outline') {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        className="btn-outline text-sm"
      >
        {loading ? 'Loading...' : label}
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-sm text-primary hover:underline disabled:opacity-50"
    >
      {loading ? 'Loading...' : label}
    </button>
  )
}
