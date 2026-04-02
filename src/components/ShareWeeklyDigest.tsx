'use client'

import { useState, useRef, useEffect } from 'react'

interface ShareWeeklyDigestProps {
  weekMonday: string
  title: string // e.g. "Week of March 23, 2026"
  productionCount: number
}

export function ShareWeeklyDigest({ weekMonday, title, productionCount }: ShareWeeklyDigestProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'social' | 'email'>('social')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const pageUrl = `https://productionlist.com/productions/week/${weekMonday}`
  const shareText = `${productionCount} film & TV productions this week on Production List — ${title}`

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Reset state when closing
  useEffect(() => {
    if (!open) {
      setResult(null)
      setCopied(false)
    }
  }, [open])

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(pageUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = pageUrl
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function handleEmailShare(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setSending(true)
    setResult(null)

    try {
      const res = await fetch('/api/share-weekly-digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: email.trim(),
          recipientName: name.trim() || undefined,
          weekMonday,
        }),
      })
      const data = await res.json()

      if (res.ok && data.success) {
        setResult({ ok: true, message: `Digest sent to ${email}!` })
        setEmail('')
        setName('')
      } else {
        setResult({ ok: false, message: data.error || 'Failed to send.' })
      }
    } catch {
      setResult({ ok: false, message: 'Network error. Please try again.' })
    } finally {
      setSending(false)
    }
  }

  const socialLinks = [
    {
      name: 'X / Twitter',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pageUrl)}`,
    },
    {
      name: 'LinkedIn',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      ),
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`,
    },
    {
      name: 'Facebook',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`,
    },
  ]

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
        aria-label="Share this weekly report"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        Share
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setTab('social')}
              className={`flex-1 text-center py-2.5 text-xs font-semibold transition-colors ${
                tab === 'social'
                  ? 'text-primary border-b-2 border-primary bg-primary/[0.03]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Social Media
            </button>
            <button
              onClick={() => setTab('email')}
              className={`flex-1 text-center py-2.5 text-xs font-semibold transition-colors ${
                tab === 'email'
                  ? 'text-primary border-b-2 border-primary bg-primary/[0.03]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Email to a Friend
            </button>
          </div>

          {tab === 'social' && (
            <div className="p-4 space-y-2">
              {socialLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 hover:text-primary transition-colors"
                >
                  <span className="text-gray-400">{link.icon}</span>
                  Share on {link.name}
                </a>
              ))}

              {/* Copy link */}
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 hover:text-primary transition-colors w-full text-left"
              >
                <span className="text-gray-400">
                  {copied ? (
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  )}
                </span>
                {copied ? 'Link copied!' : 'Copy link'}
              </button>
            </div>
          )}

          {tab === 'email' && (
            <form onSubmit={handleEmailShare} className="p-4 space-y-3">
              <p className="text-xs text-gray-500 leading-relaxed">
                Send this week's full production digest email to a friend or colleague.
              </p>

              <div>
                <label htmlFor="share-email" className="form-label">
                  Email address <span className="text-red-400">*</span>
                </label>
                <input
                  id="share-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="friend@example.com"
                  className="form-input"
                  disabled={sending}
                />
              </div>

              <div>
                <label htmlFor="share-name" className="form-label">
                  Their first name <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="share-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John"
                  className="form-input"
                  disabled={sending}
                />
              </div>

              {result && (
                <div className={`text-xs px-3 py-2 rounded-lg ${
                  result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {result.message}
                </div>
              )}

              <button
                type="submit"
                disabled={sending || !email.trim()}
                className="btn-primary w-full text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sending...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Send Digest Email
                  </span>
                )}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
