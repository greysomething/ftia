import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'What is Production List? | Production List',
  description:
    'Production List is the definitive database of film and television productions in the US. Discover active productions, find key contacts, and connect with the industry.',
}

export default function WhatIsProductionListPage() {
  return (
    <div className="page-wrap py-16">
      <div className="max-w-3xl mx-auto">
        <div className="white-bg p-8 mb-8">
          <h1 className="text-3xl font-bold text-primary mb-4">
            What is Production List?
          </h1>
          <p className="text-lg text-gray-700 mb-6">
            Production List is the most comprehensive database of active film and television productions in the United States. We track thousands of productions — from major studio features to independent films, network dramas to streaming originals — and provide detailed contact information for the people and companies involved.
          </p>

          <h2 className="text-xl font-bold text-primary mb-3">Who uses Production List?</h2>
          <ul className="space-y-2 text-gray-700 mb-6">
            {[
              'Vendors and suppliers looking to connect with active productions',
              'Location scouts and facility managers seeking production contacts',
              'Crew members researching upcoming projects',
              'Industry professionals tracking production activity',
              'Studios and agencies monitoring the competitive landscape',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-accent mt-1">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <h2 className="text-xl font-bold text-primary mb-3">What&apos;s in the database?</h2>
          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            {[
              { title: '10,000+ Productions', desc: 'Feature films, TV series, pilots, and more' },
              { title: '5,000+ Companies', desc: 'Production companies, studios, facilities' },
              { title: '8,000+ Industry Contacts', desc: 'Key crew and decision-makers' },
              { title: 'Real-time Updates', desc: 'Data updated as productions move through phases' },
            ].map((item) => (
              <div key={item.title} className="border border-gray-200 rounded-md p-4">
                <p className="font-bold text-primary mb-1">{item.title}</p>
                <p className="text-sm text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>

          <h2 className="text-xl font-bold text-primary mb-3">Production phases tracked</h2>
          <div className="flex flex-wrap gap-2 mb-6">
            {['Development', 'Pre-production', 'Production', 'Post-production', 'Completed'].map((phase) => (
              <span key={phase} className="production-status-badge">{phase}</span>
            ))}
          </div>

          <div className="bg-primary/5 rounded-lg p-6 text-center">
            <h3 className="text-xl font-bold text-primary mb-2">Ready to get started?</h3>
            <p className="text-gray-600 mb-4">
              Join thousands of industry professionals who rely on Production List.
            </p>
            <div className="flex gap-3 justify-center">
              <Link href="/membership-account/membership-levels" className="btn-primary">
                View Plans
              </Link>
              <Link href="/productions" className="btn-outline">
                See Sample Data
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
