import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Unsubscribe — Production List',
  robots: { index: false, follow: false },
}

export default function UnsubscribePage() {
  return (
    <div className="max-w-lg mx-auto py-20 px-4 text-center">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">Unsubscribe from Emails</h1>
        <p className="text-gray-600 mb-6">
          We&apos;re sorry to see you go. To unsubscribe from Production List emails,
          please send a request to:
        </p>

        <a
          href="mailto:support@productionlist.com?subject=Unsubscribe%20Request"
          className="inline-block bg-[#1B2A4A] text-white font-semibold px-6 py-3 rounded-lg hover:bg-[#2a3d66] transition-colors"
        >
          support@productionlist.com
        </a>

        <p className="text-sm text-gray-400 mt-6">
          Please allow up to 48 hours for your request to be processed.
          You will continue to receive transactional emails related to your account.
        </p>
      </div>
    </div>
  )
}
