'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface SearchResult {
  id: number
  title: string
  slug: string
  detail?: string
}

interface EntitySearchInputProps {
  /** 'company' or 'crew' */
  type: 'company' | 'crew'
  /** Current text value */
  value: string
  /** Called on every keystroke */
  onChange: (val: string) => void
  /** Called when the user selects a DB match */
  onSelect: (result: SearchResult) => void
  /** Whether this row is already linked to a DB record */
  isLinked?: boolean
  /** Input placeholder */
  placeholder?: string
  /** Extra class names for the input */
  className?: string
}

export function EntitySearchInput({
  type,
  value,
  onChange,
  onSelect,
  isLinked = false,
  placeholder = '',
  className = '',
}: EntitySearchInputProps) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2 || isLinked) {
      setResults([])
      setOpen(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/search-entities?q=${encodeURIComponent(q)}&type=${type}`
      )
      if (res.ok) {
        const data = await res.json()
        setResults(data.results ?? [])
        setOpen((data.results ?? []).length > 0)
        setActiveIndex(-1)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [type, isLinked])

  const handleChange = (val: string) => {
    onChange(val)
    // Debounce 300ms
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 300)
  }

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex(prev => Math.min(prev + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
        if (activeIndex >= 0 && activeIndex < results.length) {
          e.preventDefault()
          handleSelect(results[activeIndex])
        }
        break
      case 'Escape':
        setOpen(false)
        setActiveIndex(-1)
        break
    }
  }

  const handleSelect = (result: SearchResult) => {
    onSelect(result)
    setOpen(false)
    setResults([])
    setActiveIndex(-1)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => {
          // Re-show results if we have them
          if (results.length > 0 && !isLinked) setOpen(true)
        }}
        onKeyDown={handleKeyDown}
        className={className}
        placeholder={placeholder}
        autoComplete="off"
      />

      {/* Loading indicator */}
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <svg className="w-3.5 h-3.5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
          style={{ maxHeight: '260px', overflowY: 'auto' }}
        >
          <div className="px-2.5 py-1.5 bg-gray-50 border-b text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {type === 'company' ? 'Existing companies' : 'Existing crew members'} — click to link
          </div>
          {results.map((r, idx) => (
            <button
              key={r.id}
              type="button"
              onClick={() => handleSelect(r)}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors ${
                idx === activeIndex
                  ? 'bg-blue-50 text-blue-900'
                  : 'hover:bg-gray-50 text-gray-800'
              }`}
            >
              <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 015.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
              </svg>
              <div className="min-w-0 flex-1">
                <span className="font-medium">{r.title}</span>
                {r.detail && (
                  <span className="ml-2 text-xs text-gray-400 truncate">{r.detail}</span>
                )}
              </div>
              <span className="text-[10px] text-gray-300 flex-shrink-0">#{r.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
