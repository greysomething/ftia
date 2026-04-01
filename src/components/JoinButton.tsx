'use client'

/**
 * A button that opens the Email Popup instead of navigating to /membership-plans.
 * Dispatches a custom 'open-email-popup' event that EmailPopup listens for.
 * Falls back to /membership-plans if JavaScript is disabled.
 */
export function JoinButton({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('open-email-popup'))
      }}
      className={className}
    >
      {children}
    </button>
  )
}
