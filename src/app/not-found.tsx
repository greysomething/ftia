import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="page-wrap py-24 text-center max-w-lg mx-auto">
      <div className="white-bg p-10">
        <p className="text-6xl font-bold text-accent mb-4">404</p>
        <h1 className="text-2xl font-bold text-primary mb-4">Page Not Found</h1>
        <p className="text-gray-600 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/" className="btn-primary">
            Go Home
          </Link>
          <Link href="/productions" className="btn-outline">
            View Productions
          </Link>
        </div>
      </div>
    </div>
  )
}
