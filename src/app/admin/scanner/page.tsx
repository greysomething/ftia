import type { Metadata } from 'next'
import { getProductionTypeOptions, getProductionStatusOptions } from '@/lib/admin-queries'
import { ScannerWorkflow } from './ScannerWorkflow'

export const metadata: Metadata = { title: 'AI Scanner' }

export default async function ScannerPage() {
  const [typeOptions, statusOptions] = await Promise.all([
    getProductionTypeOptions(),
    getProductionStatusOptions(),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">AI Production Scanner</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload a production listing screenshot to extract, research, and create a new production
        </p>
      </div>
      <ScannerWorkflow typeOptions={typeOptions} statusOptions={statusOptions} />
    </div>
  )
}
