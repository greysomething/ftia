import type { Metadata } from 'next'
import './globals.css'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

export const metadata: Metadata = {
  title: {
    default: 'Production List | Film & Television Industry Alliance',
    template: '%s | Production List',
  },
  description:
    'Access 1,500+ active film and television productions in pre-production. Find contacts, crew, and project details for productions filming near you.',
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
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
