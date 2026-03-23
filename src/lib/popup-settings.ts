export interface PopupSettings {
  enabled: boolean
  trigger: 'delay' | 'pagecount' | 'exit_intent' | 'combined'
  delaySeconds: number
  pageCount: number
  exitIntentEnabled: boolean
  /** Don't show again for N days after dismiss */
  dismissDurationDays: number
  /** Don't show to logged-in users */
  hideForLoggedIn: boolean
  /** Heading text */
  heading: string
  /** Subheading text */
  subheading: string
  /** CTA button text */
  ctaText: string
}

export const DEFAULT_SETTINGS: PopupSettings = {
  enabled: true,
  trigger: 'delay',
  delaySeconds: 10,
  pageCount: 3,
  exitIntentEnabled: true,
  dismissDurationDays: 7,
  hideForLoggedIn: true,
  heading: 'Join Production List',
  subheading: 'Get instant access to 1,500+ active film & TV productions in pre-production. Find contacts, crew, and project details.',
  ctaText: 'Get Started — Free',
}

export const SETTINGS_KEY = 'email_popup_settings'
