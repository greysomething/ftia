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

          {/* Platform migration notice */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-900">Welcome to our upgraded platform</p>
                <p className="text-sm text-blue-800 mt-1">
                  If this is your first time logging in, please use{' '}
                  <a href="/forgot-password" className="font-semibold underline underline-offset-2 hover:text-blue-950">&ldquo;Forgot Password&rdquo;</a>{' '}
                  to set a new password. Your account and membership details remain unchanged.
                </p>
              </div>
            </div>
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
