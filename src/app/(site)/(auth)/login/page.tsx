import type { Metadata } from 'next'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = {
  title: 'Login | Production List',
  description: 'Sign in to your Production List membership account.',
}

interface Props {
  searchParams: Promise<{ redirect?: string; message?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        <div className="white-bg p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-primary">Member Login</h1>
            <p className="text-sm text-gray-500 mt-1">
              Sign in to access the production database
            </p>
          </div>

          {params.message && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
              {params.message}
            </div>
          )}

          <LoginForm redirectTo={params.redirect} />

          <div className="mt-6 text-center text-sm text-gray-500">
            Not a member?{' '}
            <a href="/membership-plans" className="text-primary hover:underline font-medium">
              Join Now
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
