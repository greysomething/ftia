'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'

interface Logo {
  id: number
  name: string
  image_url: string
  storage_path: string
  sort_order: number
  is_active: boolean
}

export default function NetworkLogosClient() {
  const [logos, setLogos] = useState<Logo[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragId, setDragId] = useState<number | null>(null)

  useEffect(() => {
    fetchLogos()
  }, [])

  async function fetchLogos() {
    try {
      const res = await fetch('/api/admin/network-logos')
      const data = await res.json()
      if (Array.isArray(data)) setLogos(data)
    } catch {
      setError('Failed to load logos')
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file || !newName.trim()) {
      setError('Please provide a name and select a file')
      return
    }

    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', newName.trim())

      const res = await fetch('/api/admin/network-logos', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')

      setLogos((prev) => [...prev, data])
      setNewName('')
      if (fileRef.current) fileRef.current.value = ''
      setSuccess(`${data.name} uploaded successfully`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function toggleActive(logo: Logo) {
    const res = await fetch('/api/admin/network-logos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: logo.id, is_active: !logo.is_active }),
    })
    if (res.ok) {
      setLogos((prev) =>
        prev.map((l) => (l.id === logo.id ? { ...l, is_active: !l.is_active } : l))
      )
    }
  }

  async function deleteLogo(logo: Logo) {
    if (!confirm(`Delete "${logo.name}"? This cannot be undone.`)) return

    const res = await fetch('/api/admin/network-logos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: logo.id }),
    })
    if (res.ok) {
      setLogos((prev) => prev.filter((l) => l.id !== logo.id))
      setSuccess(`${logo.name} deleted`)
      setTimeout(() => setSuccess(null), 3000)
    }
  }

  // Drag-and-drop reordering
  function handleDragStart(id: number) {
    setDragId(id)
  }

  async function handleDrop(targetId: number) {
    if (dragId === null || dragId === targetId) return

    const oldIndex = logos.findIndex((l) => l.id === dragId)
    const newIndex = logos.findIndex((l) => l.id === targetId)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = [...logos]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)

    // Update sort_order
    const updated = reordered.map((l, i) => ({ ...l, sort_order: i + 1 }))
    setLogos(updated)
    setDragId(null)

    // Save to server
    await fetch('/api/admin/network-logos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reorder: updated.map((l) => ({ id: l.id, sort_order: l.sort_order })),
      }),
    })
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-40 bg-gray-200 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Network Logos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage the logos displayed in the scrolling ticker on the homepage. Drag to reorder.
          </p>
        </div>
        <span className="text-sm text-gray-400">
          {logos.filter((l) => l.is_active).length} active / {logos.length} total
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3 mb-4">
          {success}
        </div>
      )}

      {/* Upload Form */}
      <form onSubmit={handleUpload} className="admin-card p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Upload New Logo</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Company name (e.g. Netflix)"
            className="form-input flex-1"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.svg"
            className="form-input flex-1 text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
          />
          <button
            type="submit"
            disabled={uploading}
            className="btn-primary whitespace-nowrap disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload Logo'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Recommended: SVG or transparent PNG. Logos will be displayed at ~40px height on a dark background.
        </p>
      </form>

      {/* Logo List */}
      <div className="space-y-2">
        {logos.map((logo) => (
          <div
            key={logo.id}
            draggable
            onDragStart={() => handleDragStart(logo.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(logo.id)}
            className={`admin-card p-4 flex items-center gap-4 cursor-grab active:cursor-grabbing transition-all ${
              dragId === logo.id ? 'opacity-50' : ''
            } ${!logo.is_active ? 'opacity-60' : ''}`}
          >
            {/* Drag handle */}
            <div className="text-gray-300 flex-shrink-0">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 6h2v2H8V6zm6 0h2v2h-2V6zM8 11h2v2H8v-2zm6 0h2v2h-2v-2zm-6 5h2v2H8v-2zm6 0h2v2h-2v-2z" />
              </svg>
            </div>

            {/* Logo preview */}
            <div className="w-32 h-10 bg-gray-900 rounded flex items-center justify-center flex-shrink-0 overflow-hidden px-2">
              <img
                src={logo.image_url}
                alt={logo.name}
                className="max-h-8 max-w-full object-contain brightness-0 invert"
              />
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 text-sm">{logo.name}</p>
              <p className="text-xs text-gray-400 truncate">{logo.image_url}</p>
            </div>

            {/* Status badge */}
            <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${
              logo.is_active
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500'
            }`}>
              {logo.is_active ? 'Active' : 'Hidden'}
            </span>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => toggleActive(logo)}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                title={logo.is_active ? 'Hide from homepage' : 'Show on homepage'}
              >
                {logo.is_active ? 'Hide' : 'Show'}
              </button>
              <button
                onClick={() => deleteLogo(logo)}
                className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {logos.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg mb-1">No logos yet</p>
            <p className="text-sm">Upload your first network logo above</p>
          </div>
        )}
      </div>
    </div>
  )
}
