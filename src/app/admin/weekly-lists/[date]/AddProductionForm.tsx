'use client'

import { useState } from 'react'

export function AddProductionForm({ weekMonday }: { weekMonday: string }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/weekly-entry?q=${encodeURIComponent(query.trim())}`)
      const data = await res.json()
      setResults(data.productions ?? [])
      if ((data.productions ?? []).length === 0) {
        setMessage('No productions found matching that search.')
      }
    } finally {
      setSearching(false)
    }
  }

  async function handleAdd(productionId: number) {
    setAdding(productionId)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/weekly-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productionId, weekMonday }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(data.message ?? 'Added!')
        setResults(prev => prev.filter(p => p.id !== productionId))
        // Reload after a short delay to show updated list
        setTimeout(() => window.location.reload(), 800)
      } else {
        setMessage(data.error ?? 'Failed to add.')
      }
    } finally {
      setAdding(null)
    }
  }

  return (
    <div>
      <form onSubmit={handleSearch} className="flex gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search productions by title…"
          className="form-input flex-1"
        />
        <button type="submit" disabled={searching} className="btn-primary">
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {message && (
        <p className="text-sm text-green-600 mb-2">{message}</p>
      )}

      {results.length > 0 && (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-60 overflow-y-auto">
          {results.map(p => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50">
              <div>
                <span className="font-medium text-gray-800">{p.title}</span>
                <span className="text-gray-400 text-xs ml-2">#{p.id}</span>
              </div>
              <button
                onClick={() => handleAdd(p.id)}
                disabled={adding === p.id}
                className="text-xs btn-primary py-1 px-2"
              >
                {adding === p.id ? 'Adding…' : 'Add'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
