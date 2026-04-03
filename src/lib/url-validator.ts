/**
 * URL Validator for ProductionList AI Research Results
 *
 * Validates every URL field in the AI's JSON response,
 * nullifies broken URLs, and logs them for review.
 */

const URL_FIELDS = [
  'website',
  'linkedin',
  'twitter',
  'instagram',
  'facebook',
  'youtube',
  'vimeo',
  'imdb',
]

// Social platforms that redirect to a generic page instead of 404ing
const SOFT_404_PATTERNS: Record<string, string[]> = {
  'linkedin.com': [
    '/404',
    'profile-not-found',
    'page-not-found',
  ],
  'instagram.com': [
    'Sorry, this page isn',
    "content isn't available",
  ],
  'imdb.com': [
    'Page not found',
    '404 Error',
  ],
  'twitter.com': [
    'This account doesn',
    'Something went wrong',
    'doesn\u2019t exist',
  ],
  'x.com': [
    'This account doesn',
    'Something went wrong',
    'doesn\u2019t exist',
  ],
}

interface CheckResult {
  valid: boolean
  status: number | null
  reason: string
}

interface ValidationReportEntry extends CheckResult {
  field: string
  url: string
}

/**
 * Check if a URL is reachable and not a soft 404
 */
export async function checkUrl(url: string | null | undefined, timeoutMs = 8000): Promise<CheckResult> {
  if (!url || typeof url !== 'string') {
    return { valid: false, status: null, reason: 'empty_or_null' }
  }

  // Normalize Twitter URLs (x.com vs twitter.com)
  const normalizedUrl = url.replace('twitter.com', 'x.com')

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    const response = await fetch(normalizedUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ProductionListBot/1.0)',
      },
      redirect: 'follow',
    })

    clearTimeout(timeout)

    // Hard 404 or 410
    if (response.status === 404 || response.status === 410) {
      return { valid: false, status: response.status, reason: 'not_found' }
    }

    // Server error
    if (response.status >= 500) {
      return { valid: false, status: response.status, reason: 'server_error' }
    }

    // Check for soft 404s (platform shows a page but the profile doesn't exist)
    const body = await response.text()
    for (const [domain, patterns] of Object.entries(SOFT_404_PATTERNS)) {
      if (normalizedUrl.includes(domain)) {
        for (const pattern of patterns) {
          if (body.includes(pattern)) {
            return { valid: false, status: response.status, reason: 'soft_404' }
          }
        }
      }
    }

    // Check for redirects to homepage (common when a profile is deleted)
    const finalUrl = response.url
    const originalPath = new URL(normalizedUrl).pathname
    const finalPath = new URL(finalUrl).pathname
    if (originalPath.length > 1 && (finalPath === '/' || finalPath === '')) {
      return { valid: false, status: response.status, reason: 'redirected_to_homepage' }
    }

    return { valid: true, status: response.status, reason: 'ok' }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { valid: false, status: null, reason: 'timeout' }
    }
    return { valid: false, status: null, reason: `fetch_error: ${error.message}` }
  }
}

/**
 * Validate all URL fields in an AI research response.
 * Nullifies invalid URLs and returns a validation report.
 */
export async function validateResearchUrls(data: any): Promise<{
  data: any
  validation_report: ValidationReportEntry[]
  total_checked: number
  total_valid: number
  total_invalid: number
}> {
  const report: ValidationReportEntry[] = []
  const validated = { ...data }

  // Check top-level URL fields
  for (const field of URL_FIELDS) {
    if (validated[field]) {
      const result = await checkUrl(validated[field])
      report.push({ field, url: validated[field], ...result })
      if (!result.valid) {
        // Add to searched_but_not_found if not already there
        if (!validated.searched_but_not_found) {
          validated.searched_but_not_found = []
        }
        if (!validated.searched_but_not_found.includes(field)) {
          validated.searched_but_not_found.push(
            `${field} (AI returned URL but validation failed: ${result.reason})`
          )
        }
        validated[field] = null
        // Also null out any associated confidence in field_metadata
        if (validated.field_metadata?.[field]) {
          validated.field_metadata[field] = null
        }
      }
    }
  }

  // Check URLs inside key_staff array (company research)
  if (Array.isArray(validated.key_staff)) {
    // Extend here if staff entries gain URL fields
  }

  // Check URLs inside other_profiles array (crew/person research)
  if (Array.isArray(validated.other_profiles)) {
    for (let i = 0; i < validated.other_profiles.length; i++) {
      const profile = validated.other_profiles[i]
      if (profile?.url) {
        const result = await checkUrl(profile.url)
        report.push({ field: `other_profiles[${i}].url`, url: profile.url, ...result })
        if (!result.valid) {
          validated.other_profiles[i] = null
        }
      }
    }
    validated.other_profiles = validated.other_profiles.filter(Boolean)
  }

  // Check company website URLs (production research)
  if (Array.isArray(validated.companies)) {
    for (let i = 0; i < validated.companies.length; i++) {
      const company = validated.companies[i]
      if (company?.website) {
        const result = await checkUrl(company.website)
        report.push({ field: `companies[${i}].website`, url: company.website, ...result })
        if (!result.valid) {
          validated.companies[i].website = null
        }
      }
    }
  }

  return {
    data: validated,
    validation_report: report,
    total_checked: report.length,
    total_valid: report.filter(r => r.valid).length,
    total_invalid: report.filter(r => !r.valid).length,
  }
}
