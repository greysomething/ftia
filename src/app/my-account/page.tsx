import { redirect } from 'next/navigation'

// WordPress /my-account/ → our /membership-account/
export default function MyAccountPage() {
  redirect('/membership-account')
}
