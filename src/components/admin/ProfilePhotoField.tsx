'use client'

import { useState, useRef } from 'react'

interface ProfilePhotoFieldProps {
  /** Form field name written into FormData when the form submits. */
  name: string
  /** Currently-saved manual URL (empty string when none). */
  initialValue: string
  /** What we'd render if the admin doesn't upload anything (e.g. unavatar URL). */
  fallbackUrl?: string | null
  /** Tiny helper string under the preview — explains where the fallback comes from. */
  fallbackHint?: string
}

/**
 * Admin-only profile photo picker:
 *
 *   - Shows a circular preview using the manual URL if set, otherwise the
 *     fallback (typically unavatar.io for crew members with a LinkedIn URL).
 *   - "Upload" runs the file through /api/admin/upload-image?folder=crew and
 *     stores the resulting public URL in a hidden input named `profile_image_url`.
 *   - "Clear" wipes the manual URL so the form falls back to the auto source.
 *
 * Why hidden input + onChange URL state? It mirrors the rest of CrewForm,
 * which serializes via plain FormData on submit (no controlled state plumbed
 * down through the action).
 */
export function ProfilePhotoField({ name, initialValue, fallbackUrl, fallbackHint }: ProfilePhotoFieldProps) {
  const [url, setUrl] = useState<string>(initialValue ?? '')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const previewUrl = url || fallbackUrl || null
  const usingFallback = !url && Boolean(fallbackUrl)

  async function handleFile(file: File) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image is over 5 MB. Please use a smaller file.')
      return
    }
    setError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'crew')
      const res = await fetch('/api/admin/upload-image', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || !json.url) {
        setError(json.error ?? 'Upload failed.')
        return
      }
      setUrl(json.url)
    } catch {
      setError('Network error during upload.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={url} />
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Profile preview"
              className="w-full h-full object-cover"
              onError={(e) => {
                // unavatar 404s for unknown profiles → hide so the gray bg shows.
                (e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-sm font-medium px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
            >
              {uploading ? 'Uploading…' : url ? 'Replace photo' : 'Upload photo'}
            </button>
            {url && (
              <button
                type="button"
                onClick={() => setUrl('')}
                className="text-sm text-gray-500 hover:text-red-600"
              >
                Clear
              </button>
            )}
          </div>
          {usingFallback && fallbackHint && (
            <p className="text-xs text-gray-500">{fallbackHint}</p>
          )}
          {!usingFallback && !url && fallbackHint && (
            <p className="text-xs text-gray-400">{fallbackHint}</p>
          )}
          {url && (
            <p className="text-xs text-gray-400 truncate max-w-xs">Custom photo set</p>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
