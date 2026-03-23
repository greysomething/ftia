'use client'

import { useState, useCallback, useRef } from 'react'

interface ImageScannerProps {
  /** Entity type: production | company | crew | dnw_notice */
  type: 'production' | 'company' | 'crew' | 'dnw_notice'
  /** Called with the extracted data when scan completes */
  onScanComplete: (data: any) => void
}

export function ImageScanner({ type, onScanComplete }: ImageScannerProps) {
  const [scanning, setScanning] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, etc.)')
      return
    }

    // Max 20MB
    if (file.size > 20 * 1024 * 1024) {
      setError('Image must be under 20MB')
      return
    }

    setError(null)
    setScanning(true)

    // Convert to base64
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result as string
      setPreview(base64)

      try {
        const res = await fetch('/api/admin/scan-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, type }),
        })

        const result = await res.json()
        if (!res.ok) {
          setError(result.error || 'Scan failed')
          setScanning(false)
          return
        }

        onScanComplete(result.data)
        setScanning(false)
      } catch (err: any) {
        setError(err.message || 'Network error')
        setScanning(false)
      }
    }
    reader.readAsDataURL(file)
  }, [type, onScanComplete])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          processFile(file)
        }
        break
      }
    }
  }, [processFile])

  const labels: Record<string, string> = {
    production: 'Production Listing',
    company: 'Company Listing',
    crew: 'Crew / Talent Profile',
    dnw_notice: 'Do Not Work Notice',
  }

  return (
    <div className="admin-card border-2 border-dashed border-[#3ea8c8]/30 bg-[#3ea8c8]/5" onPaste={handlePaste}>
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-[#3ea8c8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <h3 className="text-sm font-semibold text-gray-700">AI Screenshot Scanner</h3>
        <span className="text-xs text-gray-400">— Upload a screenshot to auto-fill the form</span>
      </div>

      {!scanning && !preview && (
        <div
          className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            dragOver ? 'border-[#3ea8c8] bg-[#3ea8c8]/10' : 'border-gray-300 hover:border-[#3ea8c8]/50'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) processFile(file)
            }}
          />
          <svg className="w-10 h-10 text-gray-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-gray-600 font-medium">
            Drop a {labels[type]} screenshot here
          </p>
          <p className="text-xs text-gray-400 mt-1">
            or click to browse — you can also paste from clipboard (Ctrl+V)
          </p>
        </div>
      )}

      {scanning && (
        <div className="flex flex-col items-center gap-3 py-6">
          {preview && (
            <img src={preview} alt="Scanning..." className="max-h-32 rounded-lg shadow-sm opacity-75" />
          )}
          <div className="flex items-center gap-2 text-[#3ea8c8]">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm font-medium">AI is scanning your screenshot…</span>
          </div>
          <p className="text-xs text-gray-400">This usually takes 5-15 seconds</p>
        </div>
      )}

      {!scanning && preview && (
        <div className="flex items-center gap-3 py-2">
          <img src={preview} alt="Scanned" className="h-16 rounded shadow-sm" />
          <div className="flex-1">
            <p className="text-sm text-green-600 font-medium flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Scan complete — fields populated below
            </p>
            <p className="text-xs text-gray-400">Review and adjust the fields before saving</p>
          </div>
          <button
            type="button"
            onClick={() => { setPreview(null); setError(null) }}
            className="text-xs btn-outline py-1 px-2"
          >
            Scan Another
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
          <button
            type="button"
            onClick={() => { setPreview(null); setError(null) }}
            className="ml-auto text-red-500 hover:text-red-700 text-xs underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
