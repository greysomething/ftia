import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/server'
import { emailTemplates } from '@/lib/email-templates'
import EmailAdminClient from './EmailAdminClient'

export const metadata: Metadata = { title: 'Email & Audiences' }

/**
 * Fetch audience contact counts from Resend API.
 * Uses the /audiences/{id}/contacts endpoint for accurate counts.
 */
async function getAudienceCounts() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return []

  const audienceConfigs = [
    { id: process.env.RESEND_AUDIENCE_ID, label: 'Newsletter Subscribers' },
    { id: process.env.RESEND_AUDIENCE_MEMBERS_ID, label: 'Active Members' },
    { id: process.env.RESEND_AUDIENCE_PAST_MEMBERS_ID, label: 'Past Members' },
  ].filter(a => a.id)

  const audiences = await Promise.all(
    audienceConfigs.map(async (aud) => {
      try {
        const res = await fetch(`https://api.resend.com/audiences/${aud.id}/contacts`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          next: { revalidate: 300 },
        })
        if (res.ok) {
          const data = await res.json()
          const contacts = data.data ?? []
          return {
            id: aud.id!,
            label: aud.label,
            contactCount: contacts.length,
          }
        }
      } catch { /* skip */ }
      return { id: aud.id!, label: aud.label, contactCount: 0 }
    })
  )

  return audiences
}

/**
 * Fetch recent emails directly from Resend API.
 */
async function getRecentEmails() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return []

  try {
    const res = await fetch('https://api.resend.com/emails', {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 60 },
    })
    if (res.ok) {
      const data = await res.json()
      return data.data ?? []
    }
  } catch { /* skip */ }
  return []
}

/**
 * Fetch template overrides from Supabase.
 */
async function getTemplateOverrides() {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('email_template_overrides')
      .select('*')
    return data ?? []
  } catch {
    // Table may not exist yet
    return []
  }
}

/**
 * Fetch initial email logs from Supabase.
 */
async function getEmailLogs() {
  try {
    const supabase = createAdminClient()
    const { data, count } = await supabase
      .from('email_logs')
      .select('*', { count: 'exact' })
      .order('sent_at', { ascending: false })
      .limit(50)

    return { logs: data ?? [], total: count ?? 0 }
  } catch {
    // Table may not exist yet
    return { logs: [], total: 0 }
  }
}

export default async function AdminEmailPage() {
  const [audiences, recentEmails, { logs, total }, templateOverrides] = await Promise.all([
    getAudienceCounts(),
    getRecentEmails(),
    getEmailLogs(),
    getTemplateOverrides(),
  ])

  // Serialize template info (no render functions) for client
  const templateInfo = emailTemplates.map(({ slug, name, description, category, variables }) => ({
    slug, name, description, category, variables,
  }))

  // Config status (safe previews only)
  const configStatus = {
    apiKey: !!process.env.RESEND_API_KEY,
    apiKeyPreview: process.env.RESEND_API_KEY ? `${process.env.RESEND_API_KEY.slice(0, 8)}...` : 'Not set',
    audienceId: !!process.env.RESEND_AUDIENCE_ID,
    audienceIdPreview: process.env.RESEND_AUDIENCE_ID ? `${process.env.RESEND_AUDIENCE_ID.slice(0, 12)}...` : 'Not set',
    membersId: !!process.env.RESEND_AUDIENCE_MEMBERS_ID,
    membersIdPreview: process.env.RESEND_AUDIENCE_MEMBERS_ID ? `${process.env.RESEND_AUDIENCE_MEMBERS_ID.slice(0, 12)}...` : 'Not set',
    fromAddress: process.env.EMAIL_FROM ?? '',
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Email & Audiences</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage email templates, view delivery logs, and monitor audience metrics
        </p>
      </div>

      <EmailAdminClient
        initialAudiences={audiences}
        initialLogs={logs}
        initialLogTotal={total}
        templates={templateInfo}
        recentEmails={recentEmails}
        configStatus={configStatus}
        initialOverrides={templateOverrides}
      />
    </div>
  )
}
