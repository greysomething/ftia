'use client'

import { useState, useCallback } from 'react'
import { CompanyForm } from '@/components/admin/forms/CompanyForm'
import { CompanyStaffManager } from '@/components/admin/CompanyStaffManager'

interface AIStaffResult {
  name: string
  position: string | null
  confidence: number
}

interface Props {
  company: Record<string, any>
  initialStaff: any[]
}

export function CompanyEditClient({ company, initialStaff }: Props) {
  const [aiStaff, setAiStaff] = useState<AIStaffResult[]>([])

  const handleStaffFromAI = useCallback((staff: AIStaffResult[]) => {
    setAiStaff(staff)
  }, [])

  return (
    <div className="max-w-2xl space-y-6">
      <CompanyForm company={company} onStaffFromAI={handleStaffFromAI} />
      <CompanyStaffManager
        companyId={company.id}
        initialStaff={initialStaff}
        aiSuggestedStaff={aiStaff}
        onAiStaffProcessed={() => setAiStaff([])}
      />
    </div>
  )
}
