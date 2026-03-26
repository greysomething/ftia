import { requireAdmin } from '@/lib/auth'
import NetworkLogosClient from './NetworkLogosClient'

export default async function NetworkLogosPage() {
  await requireAdmin()
  return <NetworkLogosClient />
}
