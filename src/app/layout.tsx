import type { Metadata } from 'next'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Production List | Film & Television Industry Alliance',
    template: '%s | Production List',
  },
  description:
    'Access 10,000+ active film and television productions in pre-production. Find contacts, crew, and project details for productions filming near you.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://productionlist.com'),
  openGraph: {
    siteName: 'Production List',
    type: 'website',
    locale: 'en_US',
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 flex flex-col">
        <ImpersonationBanner />
        {children}
      </body>
    </html>
  )
}
