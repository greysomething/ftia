import type { Metadata } from 'next'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { CheckoutForm } from './CheckoutForm'

export const metadata: Metadata = {
  title: 'Checkout | Production List Membership',
}

interface Props {
  searchParams: Promise<{ level?: string }>
}

export default async function MembershipCheckoutPage({ searchParams }: Props) {
  const user = await requireAuth()
  const params = await searchParams
  const levelId = parseInt(params.level ?? '3', 10)

  const supabase = await createClient()
  const { data: level } = await supabase
    .from('membership_levels')
    .select('*')
    .eq('id', levelId)
    .single()

  if (!level) {
    return (
      <div className="page-wrap py-12 text-center">
        <p className="text-red-600">Invalid membership level. <a href="/membership-account/membership-levels" className="underline">View plans</a></p>
      </div>
    )
  }

  return (
    <div className="page-wrap py-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-primary mb-2">Complete Your Membership</h1>
        <p className="text-gray-600 mb-8">You&apos;re joining: <strong>{level.name}</strong></p>
        <CheckoutForm level={level} userEmail={user.email ?? ''} />
      </div>
    </div>
  )
}
