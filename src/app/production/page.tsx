// Archive: /production/ — redirects to main productions listing
import { redirect } from 'next/navigation'
export default function ProductionArchive() {
  redirect('/productions')
}
