import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// ---- Audience IDs (hardcoded) ----
const AUDIENCE_GENERAL = '4eaf097c-c05c-4f20-b5c6-064a5e7630fe'
const AUDIENCE_ACTIVE_MEMBERS = '90a19517-19e0-44ac-90ea-847ef90c97a7'
const AUDIENCE_PAST_MEMBERS = '429350f9-9dd2-4af9-8089-e6c85c428b54'

// ---- Core helpers ----

/**
 * Add a contact to a Resend audience.
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function addToAudience(
  audienceId: string,
  email: string,
  firstName?: string,
  lastName?: string
) {
  try {
    await resend.contacts.create({
      audienceId,
      email,
      firstName: firstName ?? undefined,
      lastName: lastName ?? undefined,
      unsubscribed: false,
    })
  } catch (err) {
    console.error(`[resend-audiences] Failed to add ${email} to audience ${audienceId}:`, err)
  }
}

/**
 * Remove a contact from a Resend audience.
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function removeFromAudience(audienceId: string, email: string) {
  try {
    await resend.contacts.remove({
      audienceId,
      email,
    })
  } catch (err) {
    console.error(`[resend-audiences] Failed to remove ${email} from audience ${audienceId}:`, err)
  }
}

// ---- Shortcut helpers ----

/** Add a contact to the General (Newsletter) audience. */
export async function addToGeneralAudience(email: string, firstName?: string, lastName?: string) {
  await addToAudience(AUDIENCE_GENERAL, email, firstName, lastName)
}

/** Add a contact to the Active Members audience. */
export async function addToActiveMembersAudience(email: string, firstName?: string, lastName?: string) {
  await addToAudience(AUDIENCE_ACTIVE_MEMBERS, email, firstName, lastName)
}

/** Add a contact to the Past Members audience. */
export async function addToPastMembersAudience(email: string, firstName?: string, lastName?: string) {
  await addToAudience(AUDIENCE_PAST_MEMBERS, email, firstName, lastName)
}

/** Remove a contact from the Active Members audience. */
export async function removeFromActiveMembersAudience(email: string) {
  await removeFromAudience(AUDIENCE_ACTIVE_MEMBERS, email)
}

/** Remove a contact from the Past Members audience. */
export async function removeFromPastMembersAudience(email: string) {
  await removeFromAudience(AUDIENCE_PAST_MEMBERS, email)
}

// ---- Composite helpers ----

/** Shortcut: add to General (Newsletter) audience. Alias kept for backward compat. */
export const addToNewsletter = addToGeneralAudience

/**
 * Move a contact to Active Members:
 *  - adds to Active Members audience
 *  - removes from Past Members audience
 */
export async function moveToActiveMember(email: string, firstName?: string, lastName?: string) {
  await addToActiveMembersAudience(email, firstName, lastName)
  await removeFromPastMembersAudience(email)
}

/**
 * Move a contact to Past Members:
 *  - adds to Past Members audience
 *  - removes from Active Members audience
 */
export async function moveToPastMember(email: string, firstName?: string, lastName?: string) {
  await addToPastMembersAudience(email, firstName, lastName)
  await removeFromActiveMembersAudience(email)
}

// Legacy aliases used by existing code
export const addToActiveMembers = moveToActiveMember
export const addToPastMembers = moveToPastMember
