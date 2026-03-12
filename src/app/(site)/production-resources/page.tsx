import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Production Resources | Production List',
  description: 'Helpful resources for film and television production professionals.',
}

const resources = [
  {
    category: 'Industry Directories',
    items: [
      { name: 'Production Database', desc: 'Browse our full database of active productions', href: '/productions' },
      { name: 'Company Directory', desc: 'Production companies, studios, and facilities', href: '/production-contact' },
      { name: 'Cast & Crew', desc: 'Key contacts for active productions', href: '/production-role' },
    ],
  },
  {
    category: 'Production News',
    items: [
      { name: 'Production List Blog', desc: 'Industry news and updates', href: '/blog' },
    ],
  },
  {
    category: 'Membership',
    items: [
      { name: 'Membership Plans', desc: 'Choose the right plan for your needs', href: '/membership-plans' },
      { name: 'My Account', desc: 'Manage your membership and billing', href: '/membership-account' },
    ],
  },
]

export default function ProductionResourcesPage() {
  return (
    <div className="page-wrap py-16">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-primary mb-3">Production Resources</h1>
        <p className="text-gray-600 mb-10">
          Everything you need to stay connected with the film and television industry.
        </p>

        <div className="space-y-10">
          {resources.map((section) => (
            <div key={section.category}>
              <h2 className="text-xl font-bold text-primary mb-4 border-b border-gray-200 pb-2">
                {section.category}
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {section.items.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="white-bg p-5 block hover:shadow-md transition-shadow"
                  >
                    <p className="font-semibold text-primary mb-1">{item.name}</p>
                    <p className="text-sm text-gray-600">{item.desc}</p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
