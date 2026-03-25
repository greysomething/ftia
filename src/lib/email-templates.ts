/**
 * Email template definitions for transactional emails.
 * Each template has a unique slug, metadata, and a render function
 * that produces subject + HTML given dynamic variables.
 */

import { createAdminClient } from '@/lib/supabase/server'

export interface EmailTemplate {
  slug: string
  name: string
  description: string
  category: 'onboarding' | 'auth' | 'membership' | 'notification' | 'marketing'
  /** Variable names this template expects */
  variables: string[]
  /** Render subject + html from variables */
  render: (vars: Record<string, string>) => { subject: string; html: string }
}

const BRAND = {
  color: '#1B2A4A',
  accent: '#43B7F0',
  footer: `<p style="color: #999; font-size: 11px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
    Film &amp; Television Industry Alliance<br/>
    905 N Bethlehem Pk, #44, Spring House, PA 19477<br/>
    <a href="https://productionlist.com/unsubscribe" style="color:#999;">Unsubscribe</a>
  </p>`,
}

function wrap(body: string): string {
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
    ${body}
    ${BRAND.footer}
  </div>`
}

export const emailTemplates: EmailTemplate[] = [
  {
    slug: 'welcome',
    name: 'Welcome Email',
    description: 'Sent when a new member signs up via the subscribe form.',
    category: 'onboarding',
    variables: ['firstName', 'role', 'country'],
    render: (vars) => ({
      subject: 'Welcome to Production List — Complete Your Membership',
      html: wrap(`
        <h2 style="color: ${BRAND.color};">Welcome to Production List, ${vars.firstName || 'there'}!</h2>
        <p>Thank you for your interest in joining FTIA's Production List — the most comprehensive directory of active film and television productions in pre-production.</p>
        ${vars.role ? `<p><strong>Industry Role:</strong> ${vars.role}</p>` : ''}
        ${vars.country ? `<p><strong>Country/Zone:</strong> ${vars.country}</p>` : ''}
        <p>To complete your membership and get immediate access to our database, please select a plan:</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="https://productionlist.com/membership-plans" style="background-color: ${BRAND.accent}; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Choose Your Plan
          </a>
        </p>
      `),
    }),
  },
  {
    slug: 'password-reset',
    name: 'Password Reset',
    description: 'Sent when a user requests a password reset link.',
    category: 'auth',
    variables: ['firstName', 'resetLink'],
    render: (vars) => ({
      subject: 'Reset Your Production List Password',
      html: wrap(`
        <h2 style="color: ${BRAND.color};">Password Reset Request</h2>
        <p>Hi ${vars.firstName || 'there'},</p>
        <p>We received a request to reset your Production List password. Click the button below to choose a new password:</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${vars.resetLink || 'https://productionlist.com/reset-password'}" style="background-color: ${BRAND.accent}; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Reset Password
          </a>
        </p>
        <p style="color: #666; font-size: 13px;">If you didn't request this, you can safely ignore this email. This link expires in 24 hours.</p>
      `),
    }),
  },
  {
    slug: 'membership-confirmation',
    name: 'Membership Confirmation',
    description: 'Sent after successful payment and membership activation.',
    category: 'membership',
    variables: ['firstName', 'planName', 'expiresAt'],
    render: (vars) => ({
      subject: 'Your Production List Membership is Active!',
      html: wrap(`
        <h2 style="color: ${BRAND.color};">Membership Confirmed</h2>
        <p>Hi ${vars.firstName || 'there'},</p>
        <p>Your <strong>${vars.planName || 'Production List'}</strong> membership is now active. You have full access to our production database.</p>
        ${vars.expiresAt ? `<p><strong>Valid through:</strong> ${vars.expiresAt}</p>` : ''}
        <p style="text-align: center; margin: 24px 0;">
          <a href="https://productionlist.com/production-list" style="background-color: ${BRAND.accent}; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Browse Productions
          </a>
        </p>
        <p>Thank you for supporting FTIA and the film &amp; television community.</p>
      `),
    }),
  },
  {
    slug: 'membership-renewal-reminder',
    name: 'Membership Renewal Reminder',
    description: 'Sent 7 days before membership expiration.',
    category: 'membership',
    variables: ['firstName', 'planName', 'expiresAt'],
    render: (vars) => ({
      subject: 'Your Production List Membership Expires Soon',
      html: wrap(`
        <h2 style="color: ${BRAND.color};">Renewal Reminder</h2>
        <p>Hi ${vars.firstName || 'there'},</p>
        <p>Your <strong>${vars.planName || 'Production List'}</strong> membership expires on <strong>${vars.expiresAt || 'soon'}</strong>.</p>
        <p>Renew now to keep uninterrupted access to production listings, crew contacts, and weekly updates.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="https://productionlist.com/membership-plans" style="background-color: ${BRAND.accent}; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Renew Membership
          </a>
        </p>
      `),
    }),
  },
  {
    slug: 'weekly-digest',
    name: 'Weekly Production Digest',
    description: 'Weekly summary of new and updated productions.',
    category: 'marketing',
    variables: ['firstName', 'weekDate', 'productionCount', 'digestUrl'],
    render: (vars) => ({
      subject: `Production List Weekly Digest — ${vars.weekDate || 'This Week'}`,
      html: wrap(`
        <h2 style="color: ${BRAND.color};">Weekly Production Digest</h2>
        <p>Hi ${vars.firstName || 'there'},</p>
        <p>Here's your weekly roundup of production activity. This week we tracked <strong>${vars.productionCount || 'several'}</strong> new and updated productions in pre-production.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${vars.digestUrl || 'https://productionlist.com/production-list'}" style="background-color: ${BRAND.accent}; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            View Full Digest
          </a>
        </p>
        <p style="color: #666; font-size: 13px;">You're receiving this because you're subscribed to Production List weekly updates.</p>
      `),
    }),
  },
  {
    slug: 'contact-confirmation',
    name: 'Contact Form Confirmation',
    description: 'Auto-reply confirming receipt of a contact form submission.',
    category: 'notification',
    variables: ['firstName', 'subject'],
    render: (vars) => ({
      subject: 'We received your message — Production List',
      html: wrap(`
        <h2 style="color: ${BRAND.color};">Message Received</h2>
        <p>Hi ${vars.firstName || 'there'},</p>
        <p>Thank you for reaching out. We've received your message${vars.subject ? ` regarding <strong>${vars.subject}</strong>` : ''} and will get back to you within 1-2 business days.</p>
        <p>In the meantime, you can browse our site or check our FAQ:</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="https://productionlist.com" style="background-color: ${BRAND.accent}; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Visit Production List
          </a>
        </p>
      `),
    }),
  },
]

export function getTemplate(slug: string): EmailTemplate | undefined {
  return emailTemplates.find((t) => t.slug === slug)
}

export interface TemplateOverride {
  slug: string
  subject_override: string | null
  html_override: string | null
  is_active: boolean
  updated_at: string
}

export interface ResolvedTemplate {
  slug: string
  name: string
  description: string
  category: string
  variables: string[]
  subject: string
  html: string
  isActive: boolean
  isCustomized: boolean
}

/**
 * Get a template with any admin overrides applied.
 * Falls back gracefully if the overrides table doesn't exist yet.
 */
export async function getTemplateWithOverrides(
  slug: string,
  vars: Record<string, string> = {}
): Promise<ResolvedTemplate | null> {
  const base = getTemplate(slug)
  if (!base) return null

  // Render the default
  const defaultRendered = base.render(vars)

  // Try to fetch override
  let override: TemplateOverride | null = null
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('email_template_overrides')
      .select('*')
      .eq('slug', slug)
      .single()
    override = data as TemplateOverride | null
  } catch {
    // Table may not exist yet — use defaults
  }

  const isCustomized = !!(override?.subject_override || override?.html_override)
  const isActive = override ? override.is_active : true

  let subject = defaultRendered.subject
  let html = defaultRendered.html

  if (override?.subject_override) {
    subject = replaceVars(override.subject_override, vars)
  }
  if (override?.html_override) {
    html = replaceVars(override.html_override, vars)
  }

  return {
    slug: base.slug,
    name: base.name,
    description: base.description,
    category: base.category,
    variables: base.variables,
    subject,
    html,
    isActive,
    isCustomized,
  }
}

/**
 * Simple {{variable}} replacement for override templates.
 */
function replaceVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')
}
