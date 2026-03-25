/**
 * Reusable email-sending utility.
 * Every email sent through this function is logged to the `email_logs` table in Supabase.
 */

import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/server'
import { getTemplateWithOverrides } from '@/lib/email-templates'

const resend = new Resend(process.env.RESEND_API_KEY)
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'noreply@productionlist.com'
const FROM_NAME = 'Production List'

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  /** Template slug for logging — e.g. 'welcome', 'password-reset' */
  templateSlug?: string
  /** Override the from address */
  from?: string
  /** Reply-to address */
  replyTo?: string
}

export interface SendEmailResult {
  success: boolean
  emailId?: string
  error?: string
}

/**
 * Send an email via Resend and log it to Supabase.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const from = opts.from ?? `${FROM_NAME} <${EMAIL_FROM}>`

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    })

    if (error) {
      await logEmail({
        recipient: opts.to,
        subject: opts.subject,
        template_slug: opts.templateSlug ?? null,
        status: 'failed',
        error_message: error.message,
      })
      return { success: false, error: error.message }
    }

    await logEmail({
      recipient: opts.to,
      subject: opts.subject,
      template_slug: opts.templateSlug ?? null,
      status: 'sent',
      resend_id: data?.id ?? null,
    })

    return { success: true, emailId: data?.id }
  } catch (err: any) {
    const message = err?.message ?? 'Unknown error'
    await logEmail({
      recipient: opts.to,
      subject: opts.subject,
      template_slug: opts.templateSlug ?? null,
      status: 'failed',
      error_message: message,
    })
    return { success: false, error: message }
  }
}

// ---- Template-based email sending ----

export interface SendTemplateEmailOptions {
  to: string
  templateSlug: string
  vars: Record<string, string>
  replyTo?: string
}

/**
 * Send an email using a named template, respecting admin overrides and active/inactive status.
 */
export async function sendTemplateEmail(opts: SendTemplateEmailOptions): Promise<SendEmailResult> {
  const resolved = await getTemplateWithOverrides(opts.templateSlug, opts.vars)

  if (!resolved) {
    return { success: false, error: `Unknown template: ${opts.templateSlug}` }
  }

  if (!resolved.isActive) {
    return { success: false, error: 'Template is inactive' }
  }

  return sendEmail({
    to: opts.to,
    subject: resolved.subject,
    html: resolved.html,
    templateSlug: opts.templateSlug,
    replyTo: opts.replyTo,
  })
}

// ---- Email logging ----

interface EmailLogEntry {
  recipient: string
  subject: string
  template_slug: string | null
  status: string
  resend_id?: string | null
  error_message?: string | null
}

async function logEmail(entry: EmailLogEntry) {
  try {
    const supabase = createAdminClient()
    await supabase.from('email_logs').insert({
      recipient: entry.recipient,
      subject: entry.subject,
      template_slug: entry.template_slug,
      status: entry.status,
      resend_id: entry.resend_id ?? null,
      error_message: entry.error_message ?? null,
      sent_at: new Date().toISOString(),
    })
  } catch (err) {
    // Don't let logging failures break email sending
    console.error('[sendEmail] Failed to log email:', err)
  }
}
