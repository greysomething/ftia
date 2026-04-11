import type { Metadata } from 'next'
import { RegisterForm } from './RegisterForm'

export const metadata: Metadata = {
  title: 'Join Production List | Create Your Account',
  description: 'Create your Production List account and access thousands of film and TV productions.',
}

interface Props {
  searchParams: Promise<{ plan?: string; level?: string; name?: string; email?: string; role?: string; country?: string }>
}

export default async function RegisterPage({ searchParams }: Props) {
  const params = await searchParams
  const isFree = params.plan === 'free'
  const levelId = params.level
  // Pre-fill data from popup
  const prefill = {
    name: params.name ?? '',
    email: params.email ?? '',
    role: params.role ?? '',
    country: params.country ?? '',
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-lg">
        <div className="white-bg p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-primary">
              {isFree ? 'Create Your Free Profile' : 'Create Your Account'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {isFree
                ? 'Set up your professional industry profile in under a minute'
                : 'Join and access 10,000+ active productions'
              }
            </p>
            {isFree && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">FREE ACCOUNT</span>
                <span className="text-xs text-gray-400">No credit card required</span>
              </div>
            )}
          </div>
          <RegisterForm plan={isFree ? 'free' : undefined} levelId={levelId} prefill={prefill} />
          <div className="mt-6 text-center text-sm text-gray-500">
            Already a member?{' '}
            <a href="/login" className="text-primary hover:underline font-medium">Sign In</a>
          </div>
          {isFree && (
            <div className="mt-4 pt-4 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400">
                Want full access to contacts, crew &amp; weekly lists?{' '}
                <a href="/membership-plans" className="text-accent hover:underline font-medium">View Pro Plans</a>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
