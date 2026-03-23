import type { Metadata } from 'next'
import { StatCard } from '@/components/admin/StatCard'

export const metadata: Metadata = { title: 'Email & Audiences' }

async function getResendStats() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { audiences: [], stats: null }

  try {
    const audienceIds = [
      { id: process.env.RESEND_AUDIENCE_ID, label: 'Newsletter Subscribers' },
      { id: process.env.RESEND_AUDIENCE_MEMBERS_ID, label: 'Active Members' },
      { id: process.env.RESEND_AUDIENCE_PAST_MEMBERS_ID, label: 'Past Members' },
    ].filter(a => a.id)

    const audiences: any[] = []

    for (const aud of audienceIds) {
      try {
        const res = await fetch(`https://api.resend.com/audiences/${aud.id}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          next: { revalidate: 300 }, // cache 5 min
        })
        if (res.ok) {
          const data = await res.json()
          audiences.push({
            ...data.data,
            label: aud.label,
          })
        }
      } catch {
        // Skip failed audience lookups
      }
    }

    // Get recent emails
    const emailsRes = await fetch('https://api.resend.com/emails', {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 60 },
    })
    let recentEmails: any[] = []
    if (emailsRes.ok) {
      const emailData = await emailsRes.json()
      recentEmails = emailData.data ?? []
    }

    return { audiences, recentEmails }
  } catch (err) {
    console.error('[admin/email] Error fetching Resend data:', err)
    return { audiences: [], recentEmails: [] }
  }
}

const EMAIL_STATUS_COLORS: Record<string, string> = {
  delivered: 'badge-green',
  sent: 'badge-blue',
  opened: 'badge-green',
  clicked: 'badge-green',
  bounced: 'badge-red',
  complained: 'badge-red',
  delivery_delayed: 'badge-yellow',
}

export default async function AdminEmailPage() {
  const { audiences, recentEmails } = await getResendStats()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Email & Audiences</h1>
        <p className="text-sm text-gray-500 mt-1">Resend email service — audiences and recent activity</p>
      </div>

      {/* Audiences */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {audiences.length > 0 ? audiences.map((aud: any) => (
          <StatCard
            key={aud.id}
            label={aud.label || aud.name || 'Audience'}
            value={aud.contacts ?? '—'}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
          />
        )) : (
          <div className="col-span-3 admin-card text-center py-8">
            <p className="text-gray-400">No Resend audiences configured. Check your environment variables.</p>
          </div>
        )}
      </div>

      {/* Configuration Info */}
      <div className="admin-card mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Configuration</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${process.env.RESEND_API_KEY ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-gray-600">Resend API Key</span>
            <span className="text-gray-400 font-mono text-xs">
              {process.env.RESEND_API_KEY ? `${process.env.RESEND_API_KEY.slice(0, 8)}...` : 'Not set'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${process.env.RESEND_AUDIENCE_ID ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className="text-gray-600">Newsletter Audience</span>
            <span className="text-gray-400 font-mono text-xs">
              {process.env.RESEND_AUDIENCE_ID ? `${process.env.RESEND_AUDIENCE_ID.slice(0, 12)}...` : 'Not set'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${process.env.RESEND_AUDIENCE_MEMBERS_ID ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className="text-gray-600">Members Audience</span>
            <span className="text-gray-400 font-mono text-xs">
              {process.env.RESEND_AUDIENCE_MEMBERS_ID ? `${process.env.RESEND_AUDIENCE_MEMBERS_ID.slice(0, 12)}...` : 'Not set'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${process.env.EMAIL_FROM ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className="text-gray-600">From Address</span>
            <span className="text-gray-400 text-xs">{process.env.EMAIL_FROM ?? 'Not set'}</span>
          </div>
        </div>
      </div>

      {/* Recent Emails */}
      <div className="admin-card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="text-base font-semibold text-gray-900">Recent Emails</h2>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>To</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Sent</th>
            </tr>
          </thead>
          <tbody>
            {(!recentEmails || recentEmails.length === 0) ? (
              <tr><td colSpan={4} className="text-center text-gray-400 py-10">No recent emails found.</td></tr>
            ) : recentEmails.slice(0, 50).map((email: any) => (
              <tr key={email.id}>
                <td className="text-sm">
                  <span className="font-medium text-gray-700">
                    {Array.isArray(email.to) ? email.to.join(', ') : email.to}
                  </span>
                </td>
                <td className="text-sm text-gray-600">{email.subject ?? '—'}</td>
                <td>
                  <span className={`badge ${EMAIL_STATUS_COLORS[email.last_event] ?? 'badge-gray'}`}>
                    {email.last_event ?? 'unknown'}
                  </span>
                </td>
                <td className="text-sm text-gray-500">
                  {email.created_at ? new Date(email.created_at).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
