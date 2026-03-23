import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact Us | Production List',
  description: 'Get in touch with the Production List team.',
}

interface Props {
  searchParams: Promise<{ success?: string; error?: string }>
}

export default async function ContactPage({ searchParams }: Props) {
  const params = await searchParams
  const success = params.success === 'true'
  const error = params.error

  return (
    <div className="page-wrap py-16 max-w-2xl mx-auto">
      <div className="white-bg p-8">
        <h1 className="text-3xl font-bold text-primary mb-3">Contact Us</h1>
        <p className="text-gray-600 mb-8">
          Have a question or need support? We&apos;re here to help. Fill out the form below and we&apos;ll get back to you as soon as possible.
        </p>

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 mb-6 text-sm">
            Thank you for your message! We&apos;ll get back to you shortly.
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6 text-sm">
            {error === 'missing_fields' ? 'Please fill out all required fields.' : 'Something went wrong. Please try again.'}
          </div>
        )}

        <form
          method="POST"
          action="/api/contact"
          className="space-y-5"
        >
          <div>
            <label htmlFor="name" className="form-label">Name</label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="form-input"
              placeholder="Your name"
            />
          </div>

          <div>
            <label htmlFor="email" className="form-label">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              required
              className="form-input"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label htmlFor="subject" className="form-label">Subject</label>
            <select id="subject" name="subject" className="form-input">
              <option value="general">General Inquiry</option>
              <option value="membership">Membership / Billing</option>
              <option value="data">Data / Production Listing</option>
              <option value="technical">Technical Support</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="message" className="form-label">Message</label>
            <textarea
              id="message"
              name="message"
              required
              rows={6}
              className="form-input"
              placeholder="How can we help?"
            />
          </div>

          <button type="submit" className="btn-primary w-full">
            Send Message
          </button>
        </form>
      </div>
    </div>
  )
}
