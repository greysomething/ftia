import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Thank You | Production List',
  robots: { index: false },
}

export default function ThankYouPage() {
  return (
    <div className="page-wrap py-16 max-w-lg mx-auto text-center">
      <div className="white-bg p-10">
        <div className="text-5xl mb-6">✓</div>
        <h1 className="text-3xl font-bold text-primary mb-4">Thank You!</h1>
        <p className="text-gray-600 mb-8">
          Your submission has been received. We&apos;ll be in touch soon.
        </p>
        <Link href="/" className="btn-primary">
          Return Home
        </Link>
      </div>
    </div>
  )
}
