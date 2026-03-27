import type { Metadata } from 'next'
import ContactForm from '@/components/ContactForm'

export const metadata: Metadata = {
  title: 'Contact Us | Production List',
  description: 'Get in touch with the Production List team.',
}

export default function ContactPage() {
  return (
    <div className="page-wrap py-16 max-w-2xl mx-auto">
      <div className="white-bg p-8">
        <h1 className="text-3xl font-bold text-primary mb-3">Contact Us</h1>
        <p className="text-gray-600 mb-8">
          Have a question or need support? We&apos;re here to help. Fill out the form below and we&apos;ll get back to you as soon as possible.
        </p>

        <ContactForm />
      </div>
    </div>
  )
}
