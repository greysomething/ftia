'use client'

import { useState } from 'react'

export function PlanToggle({ planId, field, checked, label }: {
  planId: number; field: string; checked: boolean; label: string
}) {
  const [on, setOn] = useState(checked)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    const newValue = !on
    setLoading(true)
    try {
      const res = await fetch('/api/admin/membership-plan-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, field, value: newValue }),
      })
      if (res.ok) {
        setOn(newValue)
        // Refresh page to update all states
        setTimeout(() => window.location.reload(), 300)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer" title={`Toggle ${label}`}>
      <span className="text-[10px] text-gray-500 font-medium">{label}</span>
      <button
        onClick={toggle}
        disabled={loading}
        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
          on ? 'bg-green-500' : 'bg-gray-300'
        } ${loading ? 'opacity-50' : ''}`}
      >
        <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-4' : 'translate-x-0.5'
        }`} />
      </button>
    </label>
  )
}
