import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'

export const metadata = { title: 'Invoice | Production List' }

export default async function MembershipInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>
}) {
  const { userId } = await requireAuth()
  const { order: orderId } = await searchParams

  if (!orderId) redirect('/membership-account')

  const supabase = await createClient()
  const { data: order } = await supabase
    .from('membership_orders')
    .select('*, membership_levels(name)')
    .eq('id', orderId)
    .eq('user_id', userId)
    .single()

  if (!order) redirect('/membership-account')

  const levelName = (order.membership_levels as any)?.name ?? 'Membership'

  return (
    <div className="page-wrap py-16 max-w-2xl mx-auto">
      <div className="white-bg p-8">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-primary mb-1">Invoice</h1>
            <p className="text-sm text-gray-500">Order #{order.id}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Date</p>
            <p className="font-medium">{formatDate(order.created_at)}</p>
          </div>
        </div>

        <div className="border border-gray-200 rounded-md overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Description</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-200">
                <td className="px-4 py-4">
                  <p className="font-medium text-gray-900">{levelName}</p>
                  <p className="text-gray-500 text-xs mt-0.5">Production List Membership</p>
                </td>
                <td className="px-4 py-4 text-right font-medium">
                  ${(order.total / 100).toFixed(2)}
                </td>
              </tr>
            </tbody>
            <tfoot className="border-t-2 border-gray-300 bg-gray-50">
              <tr>
                <td className="px-4 py-3 font-semibold">Total</td>
                <td className="px-4 py-3 text-right font-bold text-primary">
                  ${(order.total / 100).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <p className="font-semibold text-gray-700 mb-1">Status</p>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                order.status === 'success'
                  ? 'bg-green-100 text-green-800'
                  : order.status === 'pending'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {order.status === 'success' ? 'Paid' : order.status}
            </span>
          </div>
          {order.gateway_tx_id && (
            <div>
              <p className="font-semibold text-gray-700 mb-1">Transaction ID</p>
              <p className="text-gray-600 font-mono text-xs">{order.gateway_tx_id}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <button
            onClick={() => window.print()}
            className="btn-outline text-sm"
          >
            Print Invoice
          </button>
          <Link href="/membership-account" className="btn-primary text-sm">
            Back to Account
          </Link>
        </div>
      </div>
    </div>
  )
}
