import type { Metadata } from 'next'
import { RegisterForm } from './RegisterForm'

export const metadata: Metadata = {
  title: 'Join Production List | Membership Registration',
  description: 'Create your Production List membership account and access thousands of film and TV productions.',
}

export default function RegisterPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-lg">
        <div className="white-bg p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-primary">Create Your Account</h1>
            <p className="text-sm text-gray-500 mt-1">
              Join and access 1,500+ active productions
            </p>
          </div>
          <RegisterForm />
          <div className="mt-6 text-center text-sm text-gray-500">
            Already a member?{' '}
            <a href="/login" className="text-primary hover:underline font-medium">Sign In</a>
          </div>
        </div>
      </div>
    </div>
  )
}
