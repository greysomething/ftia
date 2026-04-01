'use client'

import { useRef, useCallback } from 'react'

/** Reorder an array by moving item from `from` index to `to` index */
export function reorderArray<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr]
  const [moved] = result.splice(from, 1)
  result.splice(to, 0, moved)
  return result
}

interface DragHandleRowProps {
  index: number
  listId: string // unique ID to scope drag events (e.g. "crew" or "companies")
  onReorder: (from: number, to: number) => void
  children: React.ReactNode
  className?: string
}

/**
 * Wraps a row with drag-and-drop reordering support.
 * Only the grip handle initiates dragging — inputs/text inside remain selectable.
 */
export function DragHandleRow({ index, listId, onReorder, children, className = '' }: DragHandleRowProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const isDragHandle = useRef(false)

  // Track mousedown on the handle so we know if drag started from handle
  const onHandleMouseDown = useCallback(() => {
    isDragHandle.current = true
  }, [])

  // Reset on mouseup anywhere
  const onMouseUp = useCallback(() => {
    isDragHandle.current = false
  }, [])

  return (
    <div
      ref={rowRef}
      draggable
      onMouseUp={onMouseUp}
      onDragStart={e => {
        // Only allow drag if it started from the handle
        if (!isDragHandle.current) {
          e.preventDefault()
          return
        }
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData(`text/drag-${listId}`, String(index))
        // Add drag styling after a frame so the drag image captures the original
        requestAnimationFrame(() => rowRef.current?.classList.add('opacity-40'))
      }}
      onDragEnd={() => {
        isDragHandle.current = false
        rowRef.current?.classList.remove('opacity-40')
      }}
      onDragOver={e => {
        // Only accept drops from the same list
        if (e.dataTransfer.types.includes(`text/drag-${listId}`)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }
      }}
      onDragEnter={e => {
        if (e.dataTransfer.types.includes(`text/drag-${listId}`)) {
          rowRef.current?.classList.add('ring-2', 'ring-[#3ea8c8]/40', 'ring-offset-1')
        }
      }}
      onDragLeave={e => {
        // Only remove highlight if we're actually leaving this element
        if (!rowRef.current?.contains(e.relatedTarget as Node)) {
          rowRef.current?.classList.remove('ring-2', 'ring-[#3ea8c8]/40', 'ring-offset-1')
        }
      }}
      onDrop={e => {
        e.preventDefault()
        rowRef.current?.classList.remove('ring-2', 'ring-[#3ea8c8]/40', 'ring-offset-1')
        const fromStr = e.dataTransfer.getData(`text/drag-${listId}`)
        if (fromStr === '') return
        const from = Number(fromStr)
        if (from !== index) onReorder(from, index)
      }}
      className={`flex items-start gap-1 group transition-shadow rounded-lg ${className}`}
    >
      {/* Drag handle — only this element initiates drag */}
      <div
        ref={handleRef}
        onMouseDown={onHandleMouseDown}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing pt-2.5 px-0.5 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity select-none"
        title="Drag to reorder"
      >
        <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
          <circle cx="3" cy="2" r="1.5" />
          <circle cx="9" cy="2" r="1.5" />
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="9" cy="8" r="1.5" />
          <circle cx="3" cy="14" r="1.5" />
          <circle cx="9" cy="14" r="1.5" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  )
}
