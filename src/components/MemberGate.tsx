import Link from 'next/link'

interface MemberGateProps {
  message?: string
}

export function MemberGate({ message }: MemberGateProps) {
  return (
    <div className="my-8 p-8 bg-primary/5 border border-primary/20 rounded-lg text-center">
      <div className="text-4xl mb-4">🔒</div>
      <h3 className="text-xl font-semibold text-primary mb-2">Members Only</h3>
      <p className="text-gray-600 mb-6 max-w-md mx-auto">
        {message ?? 'Join FTIA and get full access to 10,000+ active projects filming near you.'}
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link href="/membership-plans" className="btn-accent">
          Join Now — See Pricing
        </Link>
        <Link href="/login" className="btn-outline">
          Already a Member? Login
        </Link>
      </div>
    </div>
  )
}
