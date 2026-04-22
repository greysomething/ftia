import type { Metadata } from 'next'
import { DiscoveryClient } from './DiscoveryClient'

export const metadata: Metadata = { title: 'Discovery' }

export default function DiscoveryPage() {
  return <DiscoveryClient />
}
