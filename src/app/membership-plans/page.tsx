import { redirect } from 'next/navigation'

// /membership-plans → canonical is /membership-account/membership-levels
export default function MembershipPlansPage() {
  redirect('/membership-account/membership-levels')
}
