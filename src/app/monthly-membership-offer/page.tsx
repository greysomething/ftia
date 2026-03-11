import { redirect } from 'next/navigation'

export default function MonthlyMembershipOfferPage() {
  redirect('/membership-account/membership-checkout?level=3')
}
