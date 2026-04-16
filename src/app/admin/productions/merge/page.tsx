import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MergeProductionsClient } from './MergeProductionsClient'

export const metadata: Metadata = { title: 'Merge Productions' }

interface Props {
  searchParams: Promise<{ ids?: string }>
}

export default async function MergeProductionsPage({ searchParams }: Props) {
  const { ids } = await searchParams
  const idList = (ids ?? '').split(',').map(s => Number(s.trim())).filter(Boolean)

  if (idList.length !== 2) {
    redirect('/admin/productions')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Merge Productions</h1>
        <Link href="/admin/productions" className="text-sm text-gray-500 hover:text-gray-700">
          ← Cancel and go back
        </Link>
      </div>
      <p className="text-sm text-gray-600">
        Combine two duplicate productions into one. Relations like crew, companies, and locations
        are auto-combined (deduped). For scalar fields where both have a different value, you'll be
        asked to pick which to keep. The losing production goes to trash (recoverable for 30 days)
        and a slug redirect is added so old URLs keep working.
      </p>
      <MergeProductionsClient ids={idList} />
    </div>
  )
}
