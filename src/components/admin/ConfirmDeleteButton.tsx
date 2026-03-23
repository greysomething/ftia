'use client'

interface ConfirmDeleteButtonProps {
  message?: string
  className?: string
  children?: React.ReactNode
}

export function ConfirmDeleteButton({
  message = 'Are you sure you want to delete this?',
  className = 'text-xs btn-danger py-1 px-2',
  children = 'Delete',
}: ConfirmDeleteButtonProps) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault()
      }}
    >
      {children}
    </button>
  )
}
