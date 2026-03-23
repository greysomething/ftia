import { getUser } from '@/lib/auth'
import { EmailPopup } from './EmailPopup'

/** Server Component wrapper that passes auth state to the client-side popup */
export async function EmailPopupWrapper() {
  const user = await getUser()
  return <EmailPopup isLoggedIn={!!user} />
}
