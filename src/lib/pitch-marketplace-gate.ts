/**
 * Pitch Marketplace visibility gate.
 *
 * The marketplace is built but launched dark — admins flip it on from
 * /admin/site-settings. While off:
 *   • Public/member routes (`/pitches`, `/pitches/[slug]`,
 *     `/membership-account/my-pitches/*`) call `gatePublicPitchRoute()`
 *     and 404 for everyone except admins. Admins see the page so they
 *     can preview / seed content.
 *   • Admin routes (`/admin/pitches/*`) stay reachable, but the page
 *     should call `getPitchMarketplaceState()` to render an
 *     "off for users" banner.
 *   • Nav links (Header, MobileMenu, UserNav, member sidebar) are
 *     hidden unless the flag is on OR the viewer is admin.
 *   • API routes (`/api/pitch-upload`, `/api/pitch-favorite`) call
 *     `gatePublicPitchApi()` to short-circuit non-admin requests.
 */
import { notFound } from 'next/navigation'
import { getFeatureFlags } from '@/lib/feature-flags'
import { getUser, isAdmin } from '@/lib/auth'

export interface PitchMarketplaceState {
  enabled: boolean       // user-visible: flag is true
  visible: boolean       // can THIS viewer see the marketplace? (enabled OR admin)
  isAdmin: boolean
}

/**
 * Resolve the flag and the current viewer's admin status. Use this in
 * server components / route handlers when you need to conditionally
 * render UI rather than 404.
 */
export async function getPitchMarketplaceState(): Promise<PitchMarketplaceState> {
  const flags = await getFeatureFlags()
  const user = await getUser()
  const adminStatus = user ? await isAdmin(user.id) : false
  return {
    enabled: flags.pitch_marketplace_enabled,
    visible: flags.pitch_marketplace_enabled || adminStatus,
    isAdmin: adminStatus,
  }
}

/**
 * Drop at the top of a public/member-facing pitch route. If the
 * marketplace is off and the viewer is not an admin, returns a 404.
 * Otherwise returns the state so the caller can render an admin banner.
 */
export async function gatePublicPitchRoute(): Promise<PitchMarketplaceState> {
  const state = await getPitchMarketplaceState()
  if (!state.visible) notFound()
  return state
}

/**
 * Same but for API routes — returns a Response when blocked, or null
 * when the request should proceed. Caller pattern:
 *
 *   const blocked = await gatePublicPitchApi()
 *   if (blocked) return blocked
 */
export async function gatePublicPitchApi(): Promise<Response | null> {
  const state = await getPitchMarketplaceState()
  if (state.visible) return null
  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  })
}
