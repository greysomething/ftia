import type { Metadata } from 'next'
import UnsubscribeClient from './UnsubscribeClient'

export const metadata: Metadata = {
  title: 'Unsubscribe — Production List',
  robots: { index: false, follow: false },
}

export default function UnsubscribePage() {
  return <UnsubscribeClient />
}
