'use client'

import { useState, useCallback, useRef, useEffect, useActionState } from 'react'
import { saveProduction } from '@/app/admin/productions/actions'
import { EntitySearchInput } from '@/components/admin/EntitySearchInput'
import { DragHandleRow, reorderArray } from '@/components/admin/DragHandle'
import Link from 'next/link'

interface TypeOption { id: number; name: string; slug: string }
interface StatusOption { id: number; name: string; slug: string }

interface MatchCandidate {
  id: number; title: string; slug: string; score: number; detail?: string
}

interface LocationRow {
  location: string; city: string; stage: string; country: string
  confidence?: number; source?: string; origin?: 'scan' | 'research'
}
interface CrewRow {
  role_name: string; inline_name: string; crew_id?: number | null
  inline_phones?: string[]; inline_emails?: string[]; inline_linkedin?: string
  inline_twitter?: string; inline_instagram?: string; inline_website?: string
  confidence?: number; status?: string; source?: string; origin?: 'scan' | 'research'
}
interface CompanyRow {
  inline_name: string; inline_address?: string; company_id?: number | null
  inline_phones?: string[]; inline_faxes?: string[]; inline_emails?: string[]; inline_linkedin?: string
  inline_twitter?: string; inline_instagram?: string; inline_website?: string
  confidence?: number; source?: string; origin?: 'scan' | 'research'
}

interface DuplicateMatch {
  id: number; title: string; slug: string; types: string[]; statuses: string[]
  similarity_score: number; is_same_season: boolean; season_info: string | null
}

type Step = 'upload' | 'extracting' | 'duplicates' | 'compare' | 'research' | 'review' | 'bulk-results'

interface QueueItem {
  id: string
  file: File
  preview: string
  status: 'queued' | 'processing' | 'done' | 'error'
  result?: any  // extracted production data
  error?: string
}

interface ExistingProduction {
  id: number; title: string; slug: string; content: string; excerpt: string
  production_date_start: string | null; production_date_end: string | null
  computed_status: string | null; visibility: string
  production_type_links: { is_primary: boolean; production_types: { id: number; name: string; slug: string } }[]
  production_status_links: { is_primary: boolean; production_statuses: { id: number; name: string; slug: string } }[]
  production_locations: { id: number; location: string; city: string; stage: string; country: string; sort_order: number }[]
  production_company_links: { id: number; company_id: number | null; inline_name: string; inline_address: string; inline_phones: string[]; inline_faxes: string[]; inline_emails: string[]; inline_linkedin: string; sort_order: number; companies: { id: number; title: string; slug: string } | null }[]
  production_crew_roles: { id: number; crew_id: number | null; role_name: string; inline_name: string; inline_linkedin: string; inline_phones: string[]; inline_emails: string[]; sort_order: number; crew_members: { id: number; name: string; slug: string } | null }[]
}

interface FieldDiff {
  field: string
  label: string
  existing: string
  scanned: string
  accepted: boolean
}

interface ScannerWorkflowProps {
  typeOptions: TypeOption[]
  statusOptions: StatusOption[]
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'extracting', label: 'Extract' },
  { key: 'duplicates', label: 'Duplicates' },
  { key: 'compare', label: 'Compare' },
  { key: 'research', label: 'Research' },
  { key: 'review', label: 'Review & Create' },
]

const RESEARCH_STAGES = [
  { label: 'Initializing AI research agent', icon: '🧠', duration: 3000 },
  { label: 'Scanning trade publications & databases', icon: '📰', duration: 8000 },
  { label: 'Cross-referencing crew & company records', icon: '🔗', duration: 10000 },
  { label: 'Searching film commission listings', icon: '🎬', duration: 8000 },
  { label: 'Verifying production dates & locations', icon: '📍', duration: 7000 },
  { label: 'Validating URLs & source links', icon: '🔍', duration: 6000 },
  { label: 'Compiling enriched production data', icon: '✨', duration: 5000 },
]

function ResearchProgressPanel() {
  const [stageIndex, setStageIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const startTime = useRef(Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - startTime.current) / 1000)
      setElapsed(secs)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Cycle through stages
  useEffect(() => {
    if (stageIndex >= RESEARCH_STAGES.length - 1) return
    const timer = setTimeout(() => {
      setStageIndex(i => Math.min(i + 1, RESEARCH_STAGES.length - 1))
    }, RESEARCH_STAGES[stageIndex].duration)
    return () => clearTimeout(timer)
  }, [stageIndex])

  // Smooth progress bar — fills up across all stages, slows down near the end
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        const stageProgress = (stageIndex / RESEARCH_STAGES.length) * 100
        const stageChunk = 100 / RESEARCH_STAGES.length
        const target = stageProgress + stageChunk * 0.9
        const speed = prev < 60 ? 0.8 : prev < 85 ? 0.3 : 0.08
        return Math.min(prev + speed, target, 95)
      })
    }, 100)
    return () => clearInterval(interval)
  }, [stageIndex])

  const stage = RESEARCH_STAGES[stageIndex]

  return (
    <div className="admin-card overflow-hidden">
      {/* Animated gradient header */}
      <div className="relative -mx-5 -mt-5 px-6 py-5 bg-gradient-to-r from-[#1a1a2e] via-[#16213e] to-[#0f3460] text-white overflow-hidden">
        {/* Animated particles */}
        <div className="absolute inset-0 overflow-hidden">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-[#3ea8c8]/40"
              style={{
                left: `${(i * 8.3) % 100}%`,
                top: `${(i * 13.7) % 100}%`,
                animation: `pulse ${2 + (i % 3)}s ease-in-out infinite`,
                animationDelay: `${i * 0.3}s`,
              }}
            />
          ))}
        </div>
        <div className="relative flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
              <svg className="w-6 h-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </div>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-400" />
            </span>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">AI Research in Progress</h3>
            <p className="text-sm text-blue-200/70">Analyzing production data across multiple sources</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-mono font-bold tabular-nums">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
            </div>
            <div className="text-[10px] text-blue-200/50 uppercase tracking-wider">Elapsed</div>
          </div>
        </div>
      </div>

      {/* Progress section */}
      <div className="px-1 py-6">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Research Progress</span>
            <span className="text-sm font-mono text-gray-400">{Math.round(progress)}%</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#3ea8c8] via-[#6bc5db] to-[#3ea8c8] transition-all duration-300 ease-out"
              style={{
                width: `${progress}%`,
                backgroundSize: '200% 100%',
                animation: 'shimmer 2s linear infinite',
              }}
            />
          </div>
        </div>

        {/* Stage list */}
        <div className="space-y-2">
          {RESEARCH_STAGES.map((s, i) => {
            const isActive = i === stageIndex
            const isDone = i < stageIndex
            const isPending = i > stageIndex
            return (
              <div
                key={i}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-500 ${
                  isActive ? 'bg-[#3ea8c8]/10 text-[#3ea8c8] font-medium' :
                  isDone ? 'text-gray-400' :
                  'text-gray-300'
                }`}
              >
                <span className="w-6 text-center flex-shrink-0">
                  {isDone ? (
                    <svg className="w-4 h-4 text-green-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isActive ? (
                    <span className="block w-4 h-4 mx-auto rounded-full border-2 border-[#3ea8c8] border-t-transparent animate-spin" />
                  ) : (
                    <span className="block w-2 h-2 mx-auto rounded-full bg-gray-200" />
                  )}
                </span>
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* CSS for shimmer animation */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      ` }} />
    </div>
  )
}

export function ScannerWorkflow({ typeOptions, statusOptions }: ScannerWorkflowProps) {
  const [step, setStep] = useState<Step>('upload')
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Input mode state
  const [inputMode, setInputMode] = useState<'image' | 'text'>('image')
  const [pasteText, setPasteText] = useState('')

  // Bulk queue state
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [bulkCurrentIndex, setBulkCurrentIndex] = useState(0)
  const [bulkResults, setBulkResults] = useState<any[]>([])

  // Data state
  const [scannedData, setScannedData] = useState<any>(null)
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([])
  const [researchData, setResearchData] = useState<any>(null)
  const [researching, setResearching] = useState(false)

  // Compare/update state
  const [existingProduction, setExistingProduction] = useState<ExistingProduction | null>(null)
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [fieldDiffs, setFieldDiffs] = useState<FieldDiff[]>([])
  const [crewDiffs, setCrewDiffs] = useState<{ added: CrewRow[]; acceptedAdded: boolean[] }>({ added: [], acceptedAdded: [] })
  const [companyDiffs, setCompanyDiffs] = useState<{ added: CompanyRow[]; acceptedAdded: boolean[] }>({ added: [], acceptedAdded: [] })
  const [locationDiffs, setLocationDiffs] = useState<{ added: LocationRow[]; acceptedAdded: boolean[] }>({ added: [], acceptedAdded: [] })
  const [updateMode, setUpdateMode] = useState(false) // true = updating existing, false = creating new

  // Entity matching state
  const [crewMatches, setCrewMatches] = useState<Record<string, MatchCandidate[]>>({})
  const [companyMatches, setCompanyMatches] = useState<Record<string, MatchCandidate[]>>({})
  const [matchingEntities, setMatchingEntities] = useState(false)

  // Merged form data
  const [title, setTitle] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [content, setContent] = useState('')
  const [computedStatus, setComputedStatus] = useState('')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [selectedTypeIds, setSelectedTypeIds] = useState<number[]>([])
  const [primaryTypeId, setPrimaryTypeId] = useState<number | null>(null)
  const [selectedStatusIds, setSelectedStatusIds] = useState<number[]>([])
  const [primaryStatusId, setPrimaryStatusId] = useState<number | null>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [crew, setCrew] = useState<CrewRow[]>([])
  const [companies, setCompanies] = useState<CompanyRow[]>([])

  const [formState, formAction, formPending] = useActionState(saveProduction, null)

  // Blog generation state
  const [generatingBlog, setGeneratingBlog] = useState(false)
  const [blogResult, setBlogResult] = useState<{ saved: boolean; blogPostId?: number; title?: string; error?: string } | null>(null)

  // Create listing state
  const [creatingListing, setCreatingListing] = useState<Record<string, boolean>>({})
  const [expandedSocial, setExpandedSocial] = useState<Set<string>>(new Set())
  const toggleSocial = (key: string) => {
    setExpandedSocial(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const createCrewListing = async (index: number) => {
    const c = crew[index]
    if (!c.inline_name) return
    const key = `crew-${index}`
    setCreatingListing(prev => ({ ...prev, [key]: true }))
    try {
      const res = await fetch('/api/admin/create-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'crew', name: c.inline_name, phones: c.inline_phones, emails: c.inline_emails,
          linkedin: c.inline_linkedin, twitter: c.inline_twitter, instagram: c.inline_instagram,
          website: c.inline_website, role_name: c.role_name,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCrew(prev => prev.map((cr, i) => i === index ? { ...cr, crew_id: data.id, inline_name: data.title } : cr))
    } catch (err: any) {
      alert(`Failed to create crew listing: ${err.message}`)
    } finally {
      setCreatingListing(prev => ({ ...prev, [key]: false }))
    }
  }

  const createCompanyListing = async (index: number) => {
    const c = companies[index]
    if (!c.inline_name) return
    const key = `company-${index}`
    setCreatingListing(prev => ({ ...prev, [key]: true }))
    try {
      const res = await fetch('/api/admin/create-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'company', name: c.inline_name, address: c.inline_address, phones: c.inline_phones,
          faxes: c.inline_faxes, emails: c.inline_emails, linkedin: c.inline_linkedin,
          twitter: c.inline_twitter, instagram: c.inline_instagram, website: c.inline_website,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCompanies(prev => prev.map((co, i) => i === index ? { ...co, company_id: data.id, inline_name: data.title } : co))
    } catch (err: any) {
      alert(`Failed to create company listing: ${err.message}`)
    } finally {
      setCreatingListing(prev => ({ ...prev, [key]: false }))
    }
  }

  const updateCrewListing = async (index: number) => {
    const c = crew[index]
    if (!c.crew_id) return
    const key = `crew-${index}`
    setCreatingListing(prev => ({ ...prev, [key]: true }))
    try {
      const res = await fetch('/api/admin/create-listing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'crew', id: c.crew_id, name: c.inline_name, phones: c.inline_phones,
          emails: c.inline_emails, linkedin: c.inline_linkedin, twitter: c.inline_twitter,
          instagram: c.inline_instagram, website: c.inline_website,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCreatingListing(prev => ({ ...prev, [`${key}-saved`]: true }))
      setTimeout(() => setCreatingListing(prev => ({ ...prev, [`${key}-saved`]: false })), 2000)
    } catch (err: any) {
      alert(`Failed to update crew listing: ${err.message}`)
    } finally {
      setCreatingListing(prev => ({ ...prev, [key]: false }))
    }
  }

  const updateCompanyListing = async (index: number) => {
    const c = companies[index]
    if (!c.company_id) return
    const key = `company-${index}`
    setCreatingListing(prev => ({ ...prev, [key]: true }))
    try {
      const res = await fetch('/api/admin/create-listing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'company', id: c.company_id, name: c.inline_name, address: c.inline_address,
          phones: c.inline_phones, faxes: c.inline_faxes, emails: c.inline_emails,
          linkedin: c.inline_linkedin, twitter: c.inline_twitter,
          instagram: c.inline_instagram, website: c.inline_website,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCreatingListing(prev => ({ ...prev, [`${key}-saved`]: true }))
      setTimeout(() => setCreatingListing(prev => ({ ...prev, [`${key}-saved`]: false })), 2000)
    } catch (err: any) {
      alert(`Failed to update company listing: ${err.message}`)
    } finally {
      setCreatingListing(prev => ({ ...prev, [key]: false }))
    }
  }

  // ── Step 1: Upload & Extract ──
  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('Image must be under 20MB')
      return
    }

    setError(null)
    setStep('extracting')

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result as string
      setPreview(base64)

      try {
        // Step 2: Extract via AI vision
        const res = await fetch('/api/admin/scan-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, type: 'production' }),
        })
        const result = await res.json()
        if (!res.ok) throw new Error(result.error || 'Scan failed')

        const data = result.data
        setScannedData(data)
        populateFromScan(data)
        matchEntities(data)

        // Step 3: Check duplicates
        if (data.title) {
          const dupRes = await fetch('/api/admin/check-production-duplicates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: data.title }),
          })
          const dupResult = await dupRes.json()
          const matches = dupResult.matches ?? []
          setDuplicates(matches)

          if (matches.length > 0) {
            setStep('duplicates')
          } else {
            setStep('research')
          }
        } else {
          setStep('research')
        }
      } catch (err: any) {
        setError(err.message || 'Extraction failed')
        setStep('upload')
      }
    }
    reader.readAsDataURL(file)
  }, [typeOptions, statusOptions])

  // ── Text extraction (no vision) ──
  const processText = useCallback(async (text: string) => {
    setError(null)
    setStep('extracting')
    try {
      const res = await fetch('/api/admin/scan-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, type: 'production' }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Extraction failed')

      const data = result.data
      setScannedData(data)
      populateFromScan(data)
      matchEntities(data)

      // Check duplicates
      if (data.title) {
        const dupRes = await fetch('/api/admin/check-production-duplicates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: data.title }),
        })
        const dupResult = await dupRes.json()
        const matches = dupResult.matches ?? []
        setDuplicates(matches)

        if (matches.length > 0) {
          setStep('duplicates')
        } else {
          setStep('research')
        }
      } else {
        setStep('research')
      }
    } catch (err: any) {
      setError(err.message || 'Text extraction failed')
      setStep('upload')
    }
  }, [typeOptions, statusOptions])

  // ── Bulk processing ──
  const addToQueue = useCallback((files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      setError('Please upload image files')
      return
    }

    const items: QueueItem[] = imageFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      file,
      preview: URL.createObjectURL(file),
      status: 'queued' as const,
    }))

    setQueue(prev => [...prev, ...items])
    setBulkMode(true)
  }, [])

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => {
      const item = prev.find(q => q.id === id)
      if (item) URL.revokeObjectURL(item.preview)
      const remaining = prev.filter(q => q.id !== id)
      if (remaining.length === 0) setBulkMode(false)
      return remaining
    })
  }, [])

  const processBulkQueue = useCallback(async () => {
    setBulkProcessing(true)
    setBulkCurrentIndex(0)
    const results: any[] = []

    for (let i = 0; i < queue.length; i++) {
      setBulkCurrentIndex(i)
      const item = queue[i]

      setQueue(prev => prev.map((q, idx) =>
        idx === i ? { ...q, status: 'processing' as const } : q
      ))

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(item.file)
        })

        const res = await fetch('/api/admin/scan-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, type: 'production' }),
        })
        const result = await res.json()
        if (!res.ok) throw new Error(result.error || 'Scan failed')

        const data = result.data
        results.push(data)

        setQueue(prev => prev.map((q, idx) =>
          idx === i ? { ...q, status: 'done' as const, result: data } : q
        ))
      } catch (err: any) {
        setQueue(prev => prev.map((q, idx) =>
          idx === i ? { ...q, status: 'error' as const, error: err.message } : q
        ))
        results.push(null)
      }
    }

    setBulkResults(results.filter(Boolean))
    setBulkProcessing(false)
    setStep('bulk-results')
  }, [queue])

  // Track which bulk results have been saved (by index)
  const [savedBulkIndices, setSavedBulkIndices] = useState<Set<number>>(new Set())
  const [activeBulkIndex, setActiveBulkIndex] = useState<number | null>(null)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkSaveError, setBulkSaveError] = useState<string | null>(null)
  const [bulkDraftSavingAll, setBulkDraftSavingAll] = useState(false)
  const [bulkDraftSavedCount, setBulkDraftSavedCount] = useState(0)
  const [bulkDraftErrors, setBulkDraftErrors] = useState<string[]>([])

  /** Build a FormData payload from a single bulk-extracted result, marked as draft. */
  const buildDraftFormData = useCallback((data: any): FormData | null => {
    const title = String(data?.title ?? '').trim()
    if (!title) return null

    const fd = new FormData()
    fd.set('title', title)
    fd.set('visibility', 'draft')
    fd.set('excerpt', data?.excerpt ?? '')
    fd.set('content', data?.content ?? '')
    fd.set('computed_status', data?.computed_status ?? '')
    fd.set('production_date_start', data?.production_date_start ?? '')
    fd.set('production_date_end', data?.production_date_end ?? '')

    // Map types by name → id
    const typeNames: string[] = data?.production_types ?? []
    const typeIds: number[] = []
    for (const name of typeNames) {
      const match = typeOptions.find(t => t.name.toLowerCase() === String(name).toLowerCase())
      if (match) typeIds.push(match.id)
    }
    typeIds.forEach(id => fd.append('type_ids', String(id)))
    if (typeIds[0]) fd.set('primary_type_id', String(typeIds[0]))

    // Map statuses by name → id
    const statusNames: string[] = data?.production_statuses ?? []
    const statusIds: number[] = []
    for (const name of statusNames) {
      const match = statusOptions.find(s => s.name.toLowerCase() === String(name).toLowerCase())
      if (match) statusIds.push(match.id)
    }
    statusIds.forEach(id => fd.append('status_ids', String(id)))
    if (statusIds[0]) fd.set('primary_status_id', String(statusIds[0]))

    // Locations / crew / companies — JSON-encoded as the endpoint expects
    const locations = (data?.locations ?? []).filter((l: any) => l?.location || l?.city)
    fd.set('locations_json', JSON.stringify(locations))

    const crew = (data?.crew ?? [])
      .map((c: any) => ({
        role_name: c.role_name || '',
        inline_name: c.inline_name || c.name || '',
        crew_id: c.crew_id || null,
        inline_phones: c.inline_phones || [],
        inline_emails: c.inline_emails || [],
        inline_linkedin: c.inline_linkedin || '',
        inline_twitter: c.inline_twitter || '',
        inline_instagram: c.inline_instagram || '',
        inline_website: c.inline_website || '',
      }))
      .filter((c: any) => c.inline_name)
    fd.set('crew_json', JSON.stringify(crew))

    const companies = (data?.companies ?? [])
      .map((c: any) => ({
        inline_name: c.inline_name || '',
        inline_address: c.inline_address || '',
        company_id: c.company_id || null,
        inline_phones: c.inline_phones || [],
        inline_faxes: c.inline_faxes || [],
        inline_emails: c.inline_emails || [],
        inline_linkedin: c.inline_linkedin || '',
        inline_twitter: c.inline_twitter || '',
        inline_instagram: c.inline_instagram || '',
        inline_website: c.inline_website || '',
      }))
      .filter((c: any) => c.inline_name)
    fd.set('companies_json', JSON.stringify(companies))

    return fd
  }, [typeOptions, statusOptions])

  /** Save every un-saved bulk result as a Draft, sequentially. */
  const saveAllAsDrafts = useCallback(async () => {
    if (bulkDraftSavingAll) return
    setBulkDraftSavingAll(true)
    setBulkDraftSavedCount(0)
    setBulkDraftErrors([])

    const errors: string[] = []
    let saved = 0

    for (let i = 0; i < bulkResults.length; i++) {
      if (savedBulkIndices.has(i)) continue
      const data = bulkResults[i]
      const fd = buildDraftFormData(data)
      if (!fd) {
        errors.push(`#${i + 1}: missing title — skipped`)
        continue
      }
      try {
        const res = await fetch('/api/admin/save-production', { method: 'POST', body: fd })
        const result = await res.json()
        if (!res.ok || result.error) {
          errors.push(`${data?.title || `#${i + 1}`}: ${result.error || res.statusText}`)
          continue
        }
        // Mark this index as saved (capture index for closure-safety)
        setSavedBulkIndices(prev => {
          const next = new Set(prev)
          next.add(i)
          return next
        })
        saved++
        setBulkDraftSavedCount(saved)
      } catch (err: any) {
        errors.push(`${data?.title || `#${i + 1}`}: ${err?.message || 'request failed'}`)
      }
    }

    setBulkDraftErrors(errors)
    setBulkDraftSavingAll(false)
  }, [bulkResults, savedBulkIndices, bulkDraftSavingAll, buildDraftFormData])

  const loadBulkResult = useCallback(async (data: any, index: number) => {
    setScannedData(data)
    populateFromScan(data)
    matchEntities(data)
    setActiveBulkIndex(index)
    // Keep bulkMode true so we can return to bulk results

    // Run duplicate check and route through the full workflow
    if (data.title) {
      try {
        const dupRes = await fetch('/api/admin/check-production-duplicates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: data.title }),
        })
        const dupResult = await dupRes.json()
        const matches = dupResult.matches ?? []
        setDuplicates(matches)

        if (matches.length > 0) {
          setStep('duplicates')
        } else {
          setStep('research')
        }
      } catch {
        setStep('research')
      }
    } else {
      setStep('research')
    }
  }, [typeOptions, statusOptions])

  const returnToBulkResults = useCallback(() => {
    setStep('bulk-results')
    setActiveBulkIndex(null)
    setBulkSaveError(null)
  }, [])

  // Save production via fetch (no redirect) for bulk mode
  const saveBulkProduction = useCallback(async (formEl: HTMLFormElement) => {
    setBulkSaving(true)
    setBulkSaveError(null)
    try {
      const formData = new FormData(formEl)
      const res = await fetch('/api/admin/save-production', {
        method: 'POST',
        body: formData,
      })
      const result = await res.json()
      if (!res.ok || result.error) {
        setBulkSaveError(result.error || 'Failed to save production')
        setBulkSaving(false)
        return
      }
      // Mark as saved and return to bulk results
      if (activeBulkIndex !== null) {
        setSavedBulkIndices(prev => new Set([...prev, activeBulkIndex]))
      }
      setBulkSaving(false)
      returnToBulkResults()
    } catch (err: any) {
      setBulkSaveError(err.message || 'Failed to save production')
      setBulkSaving(false)
    }
  }, [activeBulkIndex, returnToBulkResults])

  function populateFromScan(data: any) {
    setTitle(data.title || '')
    setExcerpt(data.excerpt || '')
    setContent(data.content || '')
    setComputedStatus(data.computed_status || '')
    setDateStart(data.production_date_start || '')
    setDateEnd(data.production_date_end || '')

    // Map types
    if (data.production_types?.length) {
      const ids: number[] = []
      for (const name of data.production_types) {
        const match = typeOptions.find(t => t.name.toLowerCase() === String(name).toLowerCase())
        if (match) ids.push(match.id)
      }
      if (ids.length) { setSelectedTypeIds(ids); setPrimaryTypeId(ids[0]) }
    }

    // Map statuses
    if (data.production_statuses?.length) {
      const ids: number[] = []
      for (const name of data.production_statuses) {
        const match = statusOptions.find(s => s.name.toLowerCase() === String(name).toLowerCase())
        if (match) ids.push(match.id)
      }
      if (ids.length) { setSelectedStatusIds(ids); setPrimaryStatusId(ids[0]) }
    }

    // Locations
    if (data.locations?.length) {
      setLocations(data.locations.map((l: any) => ({
        location: l.location || '', city: l.city || '', stage: l.stage || '', country: l.country || '',
        origin: 'scan' as const,
      })))
    }

    // Crew
    if (data.crew?.length) {
      setCrew(data.crew.map((c: any) => ({
        role_name: c.role_name || '', inline_name: c.inline_name || c.name || '',
        inline_phones: c.inline_phones || [], inline_emails: c.inline_emails || [],
        inline_linkedin: c.inline_linkedin || '', origin: 'scan' as const,
      })))
    }

    // Companies
    if (data.companies?.length) {
      setCompanies(data.companies.map((c: any) => ({
        inline_name: c.inline_name || '', inline_address: c.inline_address || '',
        inline_phones: c.inline_phones || [], inline_faxes: c.inline_faxes || [],
        inline_emails: c.inline_emails || [], inline_linkedin: c.inline_linkedin || '',
        origin: 'scan' as const,
      })))
    }
  }

  // ── Entity matching (runs in background after scan) ──
  async function matchEntities(data: any) {
    const crewNames = (data.crew ?? []).map((c: any) => c.inline_name || c.name).filter(Boolean)
    const companyNames = (data.companies ?? []).map((c: any) => c.inline_name).filter(Boolean)
    if (crewNames.length === 0 && companyNames.length === 0) return

    setMatchingEntities(true)
    try {
      const res = await fetch('/api/admin/match-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companies: companyNames, crew: crewNames }),
      })
      if (res.ok) {
        const result = await res.json()
        setCrewMatches(result.crewMatches ?? {})
        setCompanyMatches(result.companyMatches ?? {})

        // Auto-accept high-confidence matches (90%+)
        if (result.crewMatches) {
          setCrew(prev => prev.map(c => {
            const matches = result.crewMatches[c.inline_name]
            if (matches?.length && matches[0].score >= 90 && !c.crew_id) {
              return { ...c, crew_id: matches[0].id }
            }
            return c
          }))
        }
        if (result.companyMatches) {
          setCompanies(prev => prev.map(c => {
            const matches = result.companyMatches[c.inline_name]
            if (matches?.length && matches[0].score >= 90 && !c.company_id) {
              return { ...c, company_id: matches[0].id }
            }
            return c
          }))
        }
      }
    } catch { /* silent — matching is non-critical */ }
    setMatchingEntities(false)
  }

  // ── Compare & Update flow ──
  async function handleCompare(dupId: number) {
    setLoadingExisting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/get-production?id=${dupId}`)
      if (!res.ok) throw new Error('Failed to load production')
      const { production } = await res.json()
      setExistingProduction(production)
      computeDiffs(production)
      setStep('compare')
    } catch (err: any) {
      setError(err.message || 'Failed to load existing production')
    }
    setLoadingExisting(false)
  }

  function computeDiffs(existing: ExistingProduction) {
    const diffs: FieldDiff[] = []

    // Text fields
    const textFields: { field: string; label: string; existingVal: string; scannedVal: string }[] = [
      { field: 'title', label: 'Title', existingVal: existing.title || '', scannedVal: title || '' },
      { field: 'excerpt', label: 'Logline / Excerpt', existingVal: existing.excerpt || '', scannedVal: excerpt || '' },
      { field: 'content', label: 'Description', existingVal: existing.content || '', scannedVal: content || '' },
      { field: 'production_date_start', label: 'Start Date', existingVal: existing.production_date_start || '', scannedVal: dateStart || '' },
      { field: 'production_date_end', label: 'End Date', existingVal: existing.production_date_end || '', scannedVal: dateEnd || '' },
      { field: 'computed_status', label: 'Production Phase', existingVal: existing.computed_status || '', scannedVal: computedStatus || '' },
    ]

    for (const f of textFields) {
      const ev = f.existingVal.trim()
      const sv = f.scannedVal.trim()
      if (sv && sv !== ev) {
        diffs.push({ field: f.field, label: f.label, existing: ev, scanned: sv, accepted: true })
      }
    }

    setFieldDiffs(diffs)

    // Crew: find new crew from scan that aren't in existing
    const existingCrewNames = new Set(
      (existing.production_crew_roles ?? []).map(c => c.inline_name?.toLowerCase().trim()).filter(Boolean)
    )
    const newCrew = crew.filter(c => c.inline_name && !existingCrewNames.has(c.inline_name.toLowerCase().trim()))
    setCrewDiffs({ added: newCrew, acceptedAdded: newCrew.map(() => true) })

    // Companies: find new companies from scan not in existing
    const existingCompanyNames = new Set(
      (existing.production_company_links ?? []).map(c => c.inline_name?.toLowerCase().trim()).filter(Boolean)
    )
    const newCompanies = companies.filter(c => c.inline_name && !existingCompanyNames.has(c.inline_name.toLowerCase().trim()))
    setCompanyDiffs({ added: newCompanies, acceptedAdded: newCompanies.map(() => true) })

    // Locations: find new locations from scan not in existing
    const existingLocKeys = new Set(
      (existing.production_locations ?? []).map(l => `${l.city?.toLowerCase().trim()}|${l.location?.toLowerCase().trim()}`)
    )
    const newLocations = locations.filter(l => {
      const key = `${l.city?.toLowerCase().trim()}|${l.location?.toLowerCase().trim()}`
      return (l.city || l.location) && !existingLocKeys.has(key)
    })
    setLocationDiffs({ added: newLocations, acceptedAdded: newLocations.map(() => true) })
  }

  function applyUpdates() {
    if (!existingProduction) return

    // Build merged data from existing + accepted diffs
    let mergedTitle = existingProduction.title
    let mergedExcerpt = existingProduction.excerpt || ''
    let mergedContent = existingProduction.content || ''
    let mergedDateStart = existingProduction.production_date_start || ''
    let mergedDateEnd = existingProduction.production_date_end || ''
    let mergedComputedStatus = existingProduction.computed_status || ''

    for (const diff of fieldDiffs) {
      if (!diff.accepted) continue
      switch (diff.field) {
        case 'title': mergedTitle = diff.scanned; break
        case 'excerpt': mergedExcerpt = diff.scanned; break
        case 'content': mergedContent = diff.scanned; break
        case 'production_date_start': mergedDateStart = diff.scanned; break
        case 'production_date_end': mergedDateEnd = diff.scanned; break
        case 'computed_status': mergedComputedStatus = diff.scanned; break
      }
    }

    // Populate form state with merged data
    setTitle(mergedTitle)
    setExcerpt(mergedExcerpt)
    setContent(mergedContent)
    setDateStart(mergedDateStart)
    setDateEnd(mergedDateEnd)
    setComputedStatus(mergedComputedStatus)

    // Keep existing types/statuses (scan may not have them)
    const existingTypes = (existingProduction.production_type_links ?? []).map(l => l.production_types.id)
    const existingPrimaryType = existingProduction.production_type_links?.find(l => l.is_primary)?.production_types.id ?? null
    if (selectedTypeIds.length === 0 && existingTypes.length > 0) {
      setSelectedTypeIds(existingTypes)
      setPrimaryTypeId(existingPrimaryType)
    }
    const existingStatuses = (existingProduction.production_status_links ?? []).map(l => l.production_statuses.id)
    const existingPrimaryStatus = existingProduction.production_status_links?.find(l => l.is_primary)?.production_statuses.id ?? null
    if (selectedStatusIds.length === 0 && existingStatuses.length > 0) {
      setSelectedStatusIds(existingStatuses)
      setPrimaryStatusId(existingPrimaryStatus)
    }

    // Merge crew: existing + accepted new
    const existingCrew: CrewRow[] = (existingProduction.production_crew_roles ?? []).map(c => ({
      role_name: c.role_name || '', inline_name: c.inline_name || '',
      crew_id: c.crew_id, inline_phones: c.inline_phones || [],
      inline_emails: c.inline_emails || [], inline_linkedin: c.inline_linkedin || '',
    }))
    const acceptedNewCrew = crewDiffs.added.filter((_, i) => crewDiffs.acceptedAdded[i])
    setCrew([...existingCrew, ...acceptedNewCrew])

    // Merge companies: existing + accepted new
    const existingCompanies: CompanyRow[] = (existingProduction.production_company_links ?? []).map(c => ({
      inline_name: c.inline_name || '', inline_address: c.inline_address || '',
      company_id: c.company_id, inline_phones: c.inline_phones || [],
      inline_faxes: c.inline_faxes || [], inline_emails: c.inline_emails || [],
      inline_linkedin: c.inline_linkedin || '',
    }))
    const acceptedNewCompanies = companyDiffs.added.filter((_, i) => companyDiffs.acceptedAdded[i])
    setCompanies([...existingCompanies, ...acceptedNewCompanies])

    // Merge locations: existing + accepted new
    const existingLocs: LocationRow[] = (existingProduction.production_locations ?? []).map(l => ({
      location: l.location || '', city: l.city || '', stage: l.stage || '', country: l.country || '',
    }))
    const acceptedNewLocs = locationDiffs.added.filter((_, i) => locationDiffs.acceptedAdded[i])
    setLocations([...existingLocs, ...acceptedNewLocs])

    setUpdateMode(true)
    setStep('review')
  }

  const hasAnyChanges = fieldDiffs.length > 0 || crewDiffs.added.length > 0 || companyDiffs.added.length > 0 || locationDiffs.added.length > 0

  // ── Step 4: AI Research ──
  async function handleResearch() {
    setResearching(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/ai-research-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, existingData: scannedData }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Research failed')

      setResearchData(result.data)
      mergeResearchData(result.data)
      setStep('review')
    } catch (err: any) {
      setError(err.message || 'Research failed')
    }
    setResearching(false)
  }

  function mergeResearchData(data: any) {
    // Fill gaps — scan data takes priority
    if (!excerpt && data.synopsis) setExcerpt(data.synopsis)
    if (!content && data.additional_notes) setContent(data.additional_notes)
    if (!dateStart && data.production_date_start) setDateStart(data.production_date_start)
    if (!dateEnd && data.production_date_end) setDateEnd(data.production_date_end)

    // Merge network/genre info into content
    if (data.network_or_studio || data.genres?.length) {
      const extra: string[] = []
      if (data.network_or_studio) extra.push(`Network/Studio: ${data.network_or_studio}`)
      if (data.genres?.length) extra.push(`Genres: ${data.genres.join(', ')}`)
      const existing = content || excerpt || ''
      if (extra.length && !existing.includes(data.network_or_studio ?? '___')) {
        setContent((prev) => [prev, ...extra].filter(Boolean).join('\n'))
      }
    }

    // Add new locations from research
    if (data.locations?.length) {
      const existingLocs = new Set(locations.map(l => l.city?.toLowerCase()))
      const newLocs = data.locations.filter((l: any) =>
        l.city && !existingLocs.has(l.city.toLowerCase())
      ).map((l: any) => ({
        location: l.location || '', city: l.city || '', stage: l.stage || '', country: l.country || '',
        confidence: l.confidence, source: l.source, origin: 'research' as const,
      }))
      if (newLocs.length) setLocations(prev => [...prev, ...newLocs])
    }

    // Add new crew from research
    if (data.crew?.length) {
      const existingNames = new Set(crew.map(c => c.inline_name?.toLowerCase()))
      const newCrew = data.crew.filter((c: any) =>
        c.inline_name && !existingNames.has(c.inline_name.toLowerCase())
      ).map((c: any) => ({
        role_name: c.role_name || '', inline_name: c.inline_name || '',
        inline_phones: c.inline_phones || [], inline_emails: c.inline_emails || [],
        confidence: c.confidence, status: c.status, source: c.source,
        origin: 'research' as const,
      }))
      if (newCrew.length) setCrew(prev => [...prev, ...newCrew])

      // Also fill in missing contact info for existing crew
      for (const rc of data.crew) {
        if (!rc.inline_name) continue
        setCrew(prev => prev.map(c => {
          if (c.inline_name?.toLowerCase() !== rc.inline_name?.toLowerCase()) return c
          return {
            ...c,
            inline_phones: c.inline_phones?.length ? c.inline_phones : (rc.inline_phones || []),
            inline_emails: c.inline_emails?.length ? c.inline_emails : (rc.inline_emails || []),
          }
        }))
      }
    }

    // Add new companies from research
    if (data.companies?.length) {
      const existingNames = new Set(companies.map(c => c.inline_name?.toLowerCase()))
      const newCompanies = data.companies.filter((c: any) =>
        c.inline_name && !existingNames.has(c.inline_name.toLowerCase())
      ).map((c: any) => ({
        inline_name: c.inline_name || '', inline_address: c.inline_address || '',
        inline_phones: c.inline_phones || [], inline_faxes: [],
        inline_emails: c.inline_emails || [],
        confidence: c.confidence, source: c.source, origin: 'research' as const,
      }))
      if (newCompanies.length) setCompanies(prev => [...prev, ...newCompanies])
    }
  }

  // ── Handlers ──
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 1) {
      addToQueue(files)
    } else if (files.length === 1) {
      processFile(files[0])
    }
  }, [processFile, addToQueue])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) { e.preventDefault(); processFile(file) }
        break
      }
    }
  }, [processFile])

  function removeCrewRow(idx: number) { setCrew(prev => prev.filter((_, i) => i !== idx)) }
  function removeCompanyRow(idx: number) { setCompanies(prev => prev.filter((_, i) => i !== idx)) }
  function removeLocationRow(idx: number) { setLocations(prev => prev.filter((_, i) => i !== idx)) }

  function resetAll() {
    setStep('upload'); setPreview(null); setError(null); setScannedData(null)
    setDuplicates([]); setResearchData(null); setCrewMatches({}); setCompanyMatches({})
    setTitle(''); setExcerpt(''); setContent(''); setComputedStatus(''); setDateStart(''); setDateEnd('')
    setSelectedTypeIds([]); setPrimaryTypeId(null); setSelectedStatusIds([])
    setPrimaryStatusId(null); setLocations([]); setCrew([]); setCompanies([])
    setExistingProduction(null); setFieldDiffs([]); setCrewDiffs({ added: [], acceptedAdded: [] })
    setCompanyDiffs({ added: [], acceptedAdded: [] }); setLocationDiffs({ added: [], acceptedAdded: [] })
    setUpdateMode(false); setBlogResult(null)
    // Reset new state
    setInputMode('image'); setPasteText('')
    queue.forEach(q => URL.revokeObjectURL(q.preview))
    setQueue([]); setBulkMode(false); setBulkProcessing(false); setBulkCurrentIndex(0); setBulkResults([])
    setSavedBulkIndices(new Set()); setActiveBulkIndex(null); setBulkSaving(false); setBulkSaveError(null)
  }

  const stepIdx = STEPS.findIndex(s => s.key === step)

  // ── Origin badge ──
  function OriginBadge({ origin, confidence, status }: { origin?: string; confidence?: number; status?: string }) {
    if (origin === 'scan') return <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-100 text-blue-700">Screenshot</span>
    if (origin === 'research') {
      const color = status === 'rumored' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'
      const conf = confidence ? ` ${Math.round(confidence * 100)}%` : ''
      return <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded ${color}`}>
        {status === 'rumored' ? 'Rumored' : 'AI Researched'}{conf}
      </span>
    }
    return null
  }

  return (
    <div onPaste={handlePaste}>
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && <div className={`w-8 h-px ${i <= stepIdx ? 'bg-[#3ea8c8]' : 'bg-gray-200'}`} />}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              i === stepIdx ? 'bg-[#3ea8c8] text-white' :
              i < stepIdx ? 'bg-[#3ea8c8]/10 text-[#3ea8c8]' : 'bg-gray-100 text-gray-400'
            }`}>
              <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                {i < stepIdx ? '✓' : i + 1}
              </span>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 text-xs underline">Dismiss</button>
        </div>
      )}

      {/* ═══ STEP 1: UPLOAD ═══ */}
      {step === 'upload' && (
        <div className="space-y-4">
          {/* Tab toggle */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setInputMode('image')}
              className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
                inputMode === 'image'
                  ? 'bg-white text-[#3ea8c8] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Screenshot
            </button>
            <button
              onClick={() => setInputMode('text')}
              className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
                inputMode === 'text'
                  ? 'bg-white text-[#3ea8c8] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Paste Text
            </button>
          </div>

          {/* Screenshot mode */}
          {inputMode === 'image' && !bulkMode && (
            <div className="admin-card border-2 border-dashed border-[#3ea8c8]/30 bg-[#3ea8c8]/5">
              <div
                className={`relative rounded-lg p-16 text-center transition-colors cursor-pointer ${
                  dragOver ? 'bg-[#3ea8c8]/10' : 'hover:bg-[#3ea8c8]/5'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || [])
                    if (files.length > 1) {
                      addToQueue(files)
                    } else if (files.length === 1) {
                      processFile(files[0])
                    }
                  }} />
                <svg className="w-16 h-16 text-[#3ea8c8]/40 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <p className="text-lg font-semibold text-gray-700 mb-1">Drop a production listing screenshot</p>
                <p className="text-sm text-gray-400">or click to browse — paste from clipboard with Ctrl+V</p>
                <p className="text-xs text-gray-300 mt-2">Drop multiple images to enter bulk mode</p>
              </div>
            </div>
          )}

          {/* Bulk queue */}
          {inputMode === 'image' && bulkMode && (
            <div className="admin-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-900">
                  Bulk Upload Queue ({queue.length} {queue.length === 1 ? 'image' : 'images'})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-outline text-xs py-1 px-3"
                  >
                    + Add More
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || [])
                      if (files.length > 0) addToQueue(files)
                    }} />
                </div>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3 mb-4">
                {queue.map((item) => (
                  <div key={item.id} className="relative group">
                    <img
                      src={item.preview}
                      alt="Queued"
                      className={`w-full h-20 object-cover rounded-lg border-2 ${
                        item.status === 'processing' ? 'border-[#3ea8c8] animate-pulse' :
                        item.status === 'done' ? 'border-green-400' :
                        item.status === 'error' ? 'border-red-400' :
                        'border-gray-200'
                      }`}
                    />
                    {item.status === 'queued' && (
                      <button
                        onClick={() => removeFromQueue(item.id)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        &times;
                      </button>
                    )}
                    {item.status === 'done' && (
                      <div className="absolute inset-0 bg-green-500/20 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    {item.status === 'processing' && (
                      <div className="absolute inset-0 bg-white/50 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#3ea8c8] animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      </div>
                    )}
                    {item.status === 'error' && (
                      <div className="absolute inset-0 bg-red-500/20 rounded-lg flex items-center justify-center">
                        <span className="text-red-600 text-lg font-bold">!</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {bulkProcessing && (
                <div className="mb-4 p-3 bg-[#3ea8c8]/5 border border-[#3ea8c8]/20 rounded-lg">
                  <div className="flex items-center gap-2 text-[#3ea8c8] text-sm font-semibold">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Processing {bulkCurrentIndex + 1} of {queue.length}...
                  </div>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-[#3ea8c8] h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${((bulkCurrentIndex + 1) / queue.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={processBulkQueue}
                  disabled={bulkProcessing || queue.length === 0}
                  className="btn-primary"
                >
                  {bulkProcessing ? 'Processing...' : `Process All (${queue.length})`}
                </button>
                <button
                  onClick={() => {
                    queue.forEach(q => URL.revokeObjectURL(q.preview))
                    setQueue([])
                    setBulkMode(false)
                  }}
                  disabled={bulkProcessing}
                  className="btn-outline text-sm"
                >
                  Clear Queue
                </button>
              </div>
            </div>
          )}

          {/* Text paste mode */}
          {inputMode === 'text' && (
            <div className="admin-card">
              <div className="space-y-3">
                <div>
                  <label className="form-label">Paste Production Listing Content</label>
                  <textarea
                    rows={12}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="Paste production listing content here... Copy text from Production Weekly, industry sites, or any listing source."
                    className="form-textarea font-mono text-sm"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => processText(pasteText)}
                    disabled={!pasteText.trim()}
                    className="btn-primary"
                  >
                    Extract from Text
                  </button>
                  <button
                    onClick={() => setPasteText('')}
                    disabled={!pasteText}
                    className="btn-outline text-sm"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ STEP 2: EXTRACTING ═══ */}
      {step === 'extracting' && (
        <div className="admin-card flex flex-col items-center gap-4 py-12">
          {preview && <img src={preview} alt="Scanning..." className="max-h-48 rounded-lg shadow-sm opacity-75" />}
          <div className="flex items-center gap-2 text-[#3ea8c8]">
            <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-lg font-semibold">
              {inputMode === 'text' ? 'AI is analyzing your text...' : 'AI is reading your screenshot...'}
            </span>
          </div>
          <p className="text-sm text-gray-400">Extracting title, crew, companies, locations, and more</p>
        </div>
      )}

      {/* ═══ STEP 3: DUPLICATES ═══ */}
      {step === 'duplicates' && (
        <div className="space-y-4">
          <div className="admin-card border-l-4 border-amber-400">
            <h3 className="text-base font-bold text-gray-900 mb-1">Possible Duplicates Found</h3>
            <p className="text-sm text-gray-500 mb-4">
              We found existing productions that match <strong>&ldquo;{title}&rdquo;</strong>. Please review before continuing.
            </p>

            <div className="space-y-3">
              {duplicates.map((dup) => (
                <div key={dup.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                  <div>
                    <p className="font-semibold text-gray-900">{dup.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {dup.types.map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">{t}</span>
                      ))}
                      {dup.statuses.map(s => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium">{s}</span>
                      ))}
                      {dup.season_info && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-violet-50 text-violet-600 rounded font-medium">{dup.season_info}</span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        dup.similarity_score >= 90 ? 'bg-red-100 text-red-700' :
                        dup.similarity_score >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {dup.similarity_score}% match
                      </span>
                      {dup.is_same_season && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-bold">Same Season</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleCompare(dup.id)}
                      disabled={loadingExisting}
                      className="btn-primary text-xs py-1 px-3"
                    >
                      {loadingExisting ? 'Loading...' : 'Compare & Update'}
                    </button>
                    <Link href={`/admin/productions/${dup.id}/edit`} className="btn-outline text-xs py-1 px-3">
                      Open Existing
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-5 pt-4 border-t border-gray-200">
              <button onClick={() => setStep('research')} className="btn-primary text-sm">
                Not a Duplicate — Continue
              </button>
              {bulkMode && bulkResults.length > 0 ? (
                <button onClick={returnToBulkResults} className="btn-outline text-sm">
                  ← Back to Bulk Results
                </button>
              ) : (
                <button onClick={resetAll} className="btn-outline text-sm">
                  Start Over
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 3b: COMPARE & UPDATE ═══ */}
      {step === 'compare' && existingProduction && (
        <div className="space-y-4">
          <div className="admin-card border-l-4 border-[#3ea8c8]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">Compare Scanned Data with Existing Production</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Review what&apos;s changed. Toggle checkboxes to accept or reject each update.
                </p>
              </div>
              <Link href={`/admin/productions/${existingProduction.id}/edit`} target="_blank"
                className="text-xs text-[#3ea8c8] hover:underline flex items-center gap-1">
                View existing
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </Link>
            </div>

            {!hasAnyChanges && (
              <div className="p-6 text-center bg-green-50 rounded-lg border border-green-200">
                <svg className="w-10 h-10 text-green-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="font-semibold text-green-800">No differences found</p>
                <p className="text-sm text-green-600 mt-1">The scanned data matches the existing production.</p>
              </div>
            )}

            {/* Field-level diffs */}
            {fieldDiffs.length > 0 && (
              <div className="space-y-3 mb-5">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Field Changes</h4>
                {fieldDiffs.map((diff, i) => (
                  <label key={diff.field} className={`block p-3 rounded-lg border cursor-pointer transition-colors ${
                    diff.accepted ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={diff.accepted}
                        onChange={() => {
                          const updated = [...fieldDiffs]
                          updated[i] = { ...updated[i], accepted: !updated[i].accepted }
                          setFieldDiffs(updated)
                        }}
                        className="rounded border-gray-300 text-[#3ea8c8] focus:ring-[#3ea8c8]"
                      />
                      <span className="text-sm font-semibold text-gray-900">{diff.label}</span>
                    </div>
                    <div className="mt-2 ml-7 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-[10px] font-semibold text-red-500 uppercase">Current</span>
                        <p className="text-gray-600 mt-0.5 whitespace-pre-wrap break-words bg-red-50 rounded px-2 py-1 text-xs">
                          {diff.existing || <span className="italic text-gray-400">empty</span>}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-green-600 uppercase">From Screenshot</span>
                        <p className="text-gray-800 mt-0.5 whitespace-pre-wrap break-words bg-green-50 rounded px-2 py-1 text-xs">
                          {diff.scanned}
                        </p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* New crew from scan */}
            {crewDiffs.added.length > 0 && (
              <div className="space-y-2 mb-5">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  New Crew Members ({crewDiffs.added.length})
                </h4>
                {crewDiffs.added.map((c, i) => (
                  <label key={i} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                    crewDiffs.acceptedAdded[i] ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <input
                      type="checkbox"
                      checked={crewDiffs.acceptedAdded[i]}
                      onChange={() => {
                        const updated = [...crewDiffs.acceptedAdded]
                        updated[i] = !updated[i]
                        setCrewDiffs(prev => ({ ...prev, acceptedAdded: updated }))
                      }}
                      className="rounded border-gray-300 text-[#3ea8c8] focus:ring-[#3ea8c8]"
                    />
                    <div className="flex-1 text-sm">
                      <span className="font-medium text-gray-900">{c.inline_name}</span>
                      {c.role_name && <span className="text-gray-500 ml-2">— {c.role_name}</span>}
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-semibold">NEW</span>
                  </label>
                ))}
              </div>
            )}

            {/* New companies from scan */}
            {companyDiffs.added.length > 0 && (
              <div className="space-y-2 mb-5">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  New Companies ({companyDiffs.added.length})
                </h4>
                {companyDiffs.added.map((c, i) => (
                  <label key={i} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                    companyDiffs.acceptedAdded[i] ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <input
                      type="checkbox"
                      checked={companyDiffs.acceptedAdded[i]}
                      onChange={() => {
                        const updated = [...companyDiffs.acceptedAdded]
                        updated[i] = !updated[i]
                        setCompanyDiffs(prev => ({ ...prev, acceptedAdded: updated }))
                      }}
                      className="rounded border-gray-300 text-[#3ea8c8] focus:ring-[#3ea8c8]"
                    />
                    <span className="flex-1 text-sm font-medium text-gray-900">{c.inline_name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-semibold">NEW</span>
                  </label>
                ))}
              </div>
            )}

            {/* New locations from scan */}
            {locationDiffs.added.length > 0 && (
              <div className="space-y-2 mb-5">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  New Locations ({locationDiffs.added.length})
                </h4>
                {locationDiffs.added.map((l, i) => (
                  <label key={i} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                    locationDiffs.acceptedAdded[i] ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <input
                      type="checkbox"
                      checked={locationDiffs.acceptedAdded[i]}
                      onChange={() => {
                        const updated = [...locationDiffs.acceptedAdded]
                        updated[i] = !updated[i]
                        setLocationDiffs(prev => ({ ...prev, acceptedAdded: updated }))
                      }}
                      className="rounded border-gray-300 text-[#3ea8c8] focus:ring-[#3ea8c8]"
                    />
                    <span className="flex-1 text-sm font-medium text-gray-900">
                      {[l.location, l.city, l.stage, l.country].filter(Boolean).join(', ')}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-semibold">NEW</span>
                  </label>
                ))}
              </div>
            )}

            {/* Existing data summary (for context) */}
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Existing Production Summary</h4>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-gray-600">
                <div>
                  <span className="text-gray-400">Crew</span>
                  <p className="font-medium">{existingProduction.production_crew_roles?.length ?? 0} members</p>
                </div>
                <div>
                  <span className="text-gray-400">Companies</span>
                  <p className="font-medium">{existingProduction.production_company_links?.length ?? 0} companies</p>
                </div>
                <div>
                  <span className="text-gray-400">Locations</span>
                  <p className="font-medium">{existingProduction.production_locations?.length ?? 0} locations</p>
                </div>
                <div>
                  <span className="text-gray-400">Types</span>
                  <p className="font-medium">
                    {existingProduction.production_type_links?.map(l => l.production_types.name).join(', ') || '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 mt-5 pt-4 border-t border-gray-200">
              {hasAnyChanges ? (
                <button onClick={applyUpdates} className="btn-primary text-sm">
                  Apply {fieldDiffs.filter(d => d.accepted).length + crewDiffs.acceptedAdded.filter(Boolean).length + companyDiffs.acceptedAdded.filter(Boolean).length + locationDiffs.acceptedAdded.filter(Boolean).length} Selected Updates
                </button>
              ) : (
                <Link href={`/admin/productions/${existingProduction.id}/edit`} className="btn-primary text-sm">
                  Open Production to Edit
                </Link>
              )}
              <button onClick={() => { setUpdateMode(false); setStep('research') }} className="btn-outline text-sm">
                Create as New Instead
              </button>
              <button onClick={() => setStep('duplicates')} className="text-sm text-gray-400 hover:text-gray-600">
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 4: RESEARCH ═══ */}
      {step === 'research' && (
        <div className="space-y-4">
          {/* Extracted data summary */}
          <div className="admin-card">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <h3 className="text-sm font-semibold text-gray-900">Extracted from Screenshot</h3>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div><span className="text-gray-400 text-xs uppercase">Title</span><p className="font-medium">{title || '—'}</p></div>
              <div><span className="text-gray-400 text-xs uppercase">Types</span><p className="font-medium">{selectedTypeIds.map(id => typeOptions.find(t => t.id === id)?.name).filter(Boolean).join(', ') || '—'}</p></div>
              <div><span className="text-gray-400 text-xs uppercase">Crew</span><p className="font-medium">{crew.length} members</p></div>
              <div><span className="text-gray-400 text-xs uppercase">Companies</span><p className="font-medium">{companies.length} companies</p></div>
            </div>
          </div>

          {researching ? (
            <ResearchProgressPanel />
          ) : (
            <div className="admin-card border-2 border-dashed border-[#3ea8c8]/30 bg-[#3ea8c8]/5">
              <div className="text-center py-6">
                <svg className="w-12 h-12 text-[#3ea8c8]/50 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-700 mb-1">AI Research & Enrichment</h3>
                <p className="text-sm text-gray-400 mb-4 max-w-md mx-auto">
                  Search trade publications, film commissions, and industry databases to find additional crew, contacts, dates, and verify existing information.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button onClick={handleResearch} disabled={researching} className="btn-primary">
                    Research & Enrich with AI
                  </button>
                  <button onClick={() => setStep('review')} className="btn-outline text-sm">
                    Skip — Go to Review
                  </button>
                  {bulkMode && bulkResults.length > 0 && (
                    <button onClick={returnToBulkResults} className="btn-outline text-sm">
                      ← Back to Bulk Results
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ BULK RESULTS ═══ */}
      {step === 'bulk-results' && (
        <div className="space-y-4">
          <div className="admin-card">
            <div className="flex items-center justify-between mb-4 gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Bulk Extraction Results</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {bulkResults.length} production{bulkResults.length !== 1 ? 's' : ''} extracted. Click any to review and save — or save them all as drafts.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {(() => {
                  const remaining = bulkResults.length - savedBulkIndices.size
                  return (
                    <button
                      type="button"
                      onClick={saveAllAsDrafts}
                      disabled={bulkDraftSavingAll || remaining === 0}
                      className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Save every remaining extraction as a Draft so you can review later"
                    >
                      {bulkDraftSavingAll
                        ? `Saving drafts… ${bulkDraftSavedCount}/${remaining}`
                        : `Save All as Drafts${remaining > 0 ? ` (${remaining})` : ''}`}
                    </button>
                  )
                })()}
                <button onClick={resetAll} disabled={bulkDraftSavingAll} className="btn-outline text-sm disabled:opacity-50">Start Over</button>
              </div>
            </div>

            {/* Draft-save error summary */}
            {bulkDraftErrors.length > 0 && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <p className="font-semibold mb-1">{bulkDraftErrors.length} draft{bulkDraftErrors.length !== 1 ? 's' : ''} failed to save:</p>
                {bulkDraftErrors.map((msg, idx) => (
                  <span key={idx} className="block text-xs mt-0.5">• {msg}</span>
                ))}
              </div>
            )}

            {/* Error summary */}
            {queue.filter(q => q.status === 'error').length > 0 && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {queue.filter(q => q.status === 'error').length} image{queue.filter(q => q.status === 'error').length !== 1 ? 's' : ''} failed to process.
                {queue.filter(q => q.status === 'error').map(q => (
                  <span key={q.id} className="block text-xs mt-1">{q.file.name}: {q.error}</span>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {bulkResults.map((data, i) => {
                const isSaved = savedBulkIndices.has(i)
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between p-4 bg-white border rounded-lg transition-colors ${
                      isSaved
                        ? 'border-green-300 bg-green-50/50'
                        : 'border-gray-200 hover:border-[#3ea8c8]/40 hover:bg-[#3ea8c8]/5'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 truncate">{data.title || 'Untitled'}</p>
                        {isSaved && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300 flex-shrink-0">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            Saved
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        {data.production_types?.length > 0 && (
                          <span>{data.production_types.join(', ')}</span>
                        )}
                        {data.crew?.length > 0 && (
                          <span>{data.crew.length} crew</span>
                        )}
                        {data.companies?.length > 0 && (
                          <span>{data.companies.length} {data.companies.length === 1 ? 'company' : 'companies'}</span>
                        )}
                        {data.locations?.length > 0 && (
                          <span>{data.locations.length} {data.locations.length === 1 ? 'location' : 'locations'}</span>
                        )}
                      </div>
                      {data.excerpt && (
                        <p className="text-xs text-gray-400 mt-1 truncate">{data.excerpt}</p>
                      )}
                    </div>
                    <button
                      onClick={() => loadBulkResult(data, i)}
                      className={`text-xs py-1.5 px-4 ml-4 flex-shrink-0 ${isSaved ? 'btn-outline' : 'btn-primary'}`}
                    >
                      {isSaved ? 'Review Again' : 'Review & Save'}
                    </button>
                  </div>
                )
              })}
            </div>
            {savedBulkIndices.size > 0 && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 flex items-center justify-between">
                <span>{savedBulkIndices.size} of {bulkResults.length} productions saved.</span>
                {savedBulkIndices.size === bulkResults.length && (
                  <span className="font-medium">All done!</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ STEP 5: REVIEW & CREATE ═══ */}
      {step === 'review' && (
        <form
          ref={formRef}
          action={bulkMode ? undefined : formAction}
          onSubmit={bulkMode ? (e) => {
            e.preventDefault()
            if (formRef.current) saveBulkProduction(formRef.current)
          } : undefined}
          className="space-y-5"
        >
          {formState?.error && !bulkMode && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{formState.error}</div>
          )}
          {bulkSaveError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{bulkSaveError}</div>
          )}

          {/* Hidden fields for saveProduction */}
          {updateMode && existingProduction && (
            <input type="hidden" name="id" value={existingProduction.id} />
          )}
          {selectedTypeIds.map(id => <input key={id} type="hidden" name="type_ids" value={id} />)}
          {primaryTypeId && <input type="hidden" name="primary_type_id" value={primaryTypeId} />}
          {selectedStatusIds.map(id => <input key={id} type="hidden" name="status_ids" value={id} />)}
          {primaryStatusId && <input type="hidden" name="primary_status_id" value={primaryStatusId} />}
          <input type="hidden" name="locations_json" value={JSON.stringify(locations.filter(l => l.location || l.city))} />
          <input type="hidden" name="crew_json" value={JSON.stringify(crew.filter(c => c.inline_name))} />
          <input type="hidden" name="companies_json" value={JSON.stringify(companies.filter(c => c.inline_name))} />

          {/* Update mode banner */}
          {updateMode && existingProduction && (
            <div className="admin-card p-3 border-l-4 border-[#3ea8c8] bg-blue-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-[#3ea8c8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="text-sm font-semibold text-[#3ea8c8]">Updating existing production #{existingProduction.id}</span>
                </div>
                <Link href={`/admin/productions/${existingProduction.id}/edit`} target="_blank"
                  className="text-xs text-[#3ea8c8] hover:underline">View original</Link>
              </div>
            </div>
          )}

          {/* Preview image */}
          {preview && (
            <div className="admin-card p-3">
              <div className="flex items-center gap-3">
                <img src={preview} alt="Source" className="h-20 rounded shadow-sm" />
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold">Source Screenshot</p>
                  <p className="text-sm text-gray-600 mt-0.5">Review the {updateMode ? 'merged' : 'extracted and researched'} data below</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Main content — left 2 columns */}
            <div className="lg:col-span-2 space-y-5">

              {/* Basic Info */}
              <div className="admin-card space-y-4">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Basic Info</h3>
                <div>
                  <label className="form-label">Title *</label>
                  <input name="title" required value={title} onChange={e => setTitle(e.target.value)}
                    className="form-input text-lg font-semibold" />
                </div>
                <div>
                  <label className="form-label">Logline / Excerpt</label>
                  <textarea name="excerpt" rows={2} value={excerpt} onChange={e => setExcerpt(e.target.value)}
                    className="form-textarea" />
                </div>
                <div>
                  <label className="form-label">Description / Notes</label>
                  <textarea name="content" rows={4} value={content} onChange={e => setContent(e.target.value)}
                    className="form-textarea" />
                </div>
              </div>

              {/* Locations */}
              <div className="admin-card space-y-3">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Locations ({locations.length})</h3>
                {locations.map((loc, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                    <div className="flex-1 grid grid-cols-4 gap-2">
                      <input placeholder="Location" value={loc.location} onChange={e => {
                        const updated = [...locations]; updated[i] = { ...updated[i], location: e.target.value }; setLocations(updated)
                      }} className="form-input text-sm" />
                      <input placeholder="City" value={loc.city} onChange={e => {
                        const updated = [...locations]; updated[i] = { ...updated[i], city: e.target.value }; setLocations(updated)
                      }} className="form-input text-sm" />
                      <input placeholder="State" value={loc.stage} onChange={e => {
                        const updated = [...locations]; updated[i] = { ...updated[i], stage: e.target.value }; setLocations(updated)
                      }} className="form-input text-sm" />
                      <input placeholder="Country" value={loc.country} onChange={e => {
                        const updated = [...locations]; updated[i] = { ...updated[i], country: e.target.value }; setLocations(updated)
                      }} className="form-input text-sm" />
                    </div>
                    <OriginBadge origin={loc.origin} confidence={loc.confidence} />
                    <button type="button" onClick={() => removeLocationRow(i)} className="text-red-400 hover:text-red-600 p-1 text-xs">&times;</button>
                  </div>
                ))}
                <button type="button" onClick={() => setLocations(prev => [...prev, { location: '', city: '', stage: '', country: '' }])}
                  className="text-xs text-[#3ea8c8] hover:underline">+ Add Location</button>
              </div>

              {/* Crew */}
              <div className="admin-card space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Crew ({crew.length})</h3>
                  {matchingEntities && <span className="text-[10px] text-gray-400 animate-pulse">Matching to database...</span>}
                </div>
                <div className="space-y-2">
                  {crew.map((c, i) => {
                    const matches = crewMatches[c.inline_name] ?? []
                    const linkedFromFuzzy = c.crew_id ? matches.find(m => m.id === c.crew_id) : null
                    return (
                      <DragHandleRow key={i} index={i} listId="scan-crew" onReorder={(from, to) => setCrew(prev => reorderArray(prev, from, to))}>
                      <div className="space-y-1">
                        <div className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                          <div className="flex-1 grid grid-cols-4 gap-2">
                            <input placeholder="Role" value={c.role_name} onChange={e => {
                              const updated = [...crew]; updated[i] = { ...updated[i], role_name: e.target.value }; setCrew(updated)
                            }} className="form-input text-sm" />
                            <EntitySearchInput
                              type="crew"
                              value={c.inline_name}
                              onChange={val => {
                                const updated = [...crew]; updated[i] = { ...updated[i], inline_name: val, crew_id: null }; setCrew(updated)
                              }}
                              onSelect={r => {
                                const updated = [...crew]; updated[i] = { ...updated[i], inline_name: r.title, crew_id: r.id }; setCrew(updated)
                              }}
                              isLinked={!!c.crew_id}
                              placeholder="Name"
                              className="form-input text-sm"
                            />
                            <input placeholder="Phone" value={c.inline_phones?.join(', ') || ''} onChange={e => {
                              const updated = [...crew]; updated[i] = { ...updated[i], inline_phones: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }; setCrew(updated)
                            }} className="form-input text-sm" />
                            <input placeholder="Email" value={c.inline_emails?.join(', ') || ''} onChange={e => {
                              const updated = [...crew]; updated[i] = { ...updated[i], inline_emails: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }; setCrew(updated)
                            }} className="form-input text-sm" />
                          </div>
                          <OriginBadge origin={c.origin} confidence={c.confidence} status={c.status} />
                          <button type="button" onClick={() => removeCrewRow(i)} className="text-red-400 hover:text-red-600 p-1 text-xs">&times;</button>
                        </div>
                        {/* Social & Action buttons */}
                        <div className="flex items-center gap-2 ml-2 mt-0.5 mb-1 pb-1 border-b border-gray-100">
                          <button type="button" onClick={() => toggleSocial(`crew-${i}`)}
                            className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
                            <svg className={`w-3 h-3 transition-transform ${expandedSocial.has(`crew-${i}`) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            Social & Web
                          </button>
                          <div className="ml-auto flex items-center gap-2">
                            {creatingListing[`crew-${i}-saved`] && (
                              <span className="text-[11px] text-green-600 font-medium flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                Saved
                              </span>
                            )}
                            {c.crew_id && c.inline_name && (
                              <button type="button" onClick={() => updateCrewListing(i)}
                                disabled={creatingListing[`crew-${i}`]}
                                className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                                {creatingListing[`crew-${i}`] ? (
                                  <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Saving...</>
                                ) : (
                                  <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg> Update Listing</>
                                )}
                              </button>
                            )}
                            {!c.crew_id && c.inline_name && (
                              <button type="button" onClick={() => createCrewListing(i)}
                                disabled={creatingListing[`crew-${i}`]}
                                className="text-[11px] text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
                                {creatingListing[`crew-${i}`] ? (
                                  <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Creating...</>
                                ) : (
                                  <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> Create Listing</>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                        {expandedSocial.has(`crew-${i}`) && (
                          <div className="ml-2 grid grid-cols-4 gap-2 pt-1 pb-2 mb-1 border-b border-dashed border-gray-200">
                            <input placeholder="LinkedIn" value={c.inline_linkedin || ''} onChange={e => {
                              const updated = [...crew]; updated[i] = { ...updated[i], inline_linkedin: e.target.value }; setCrew(updated)
                            }} className="form-input text-xs" />
                            <input placeholder="Twitter / X" value={c.inline_twitter || ''} onChange={e => {
                              const updated = [...crew]; updated[i] = { ...updated[i], inline_twitter: e.target.value }; setCrew(updated)
                            }} className="form-input text-xs" />
                            <input placeholder="Instagram" value={c.inline_instagram || ''} onChange={e => {
                              const updated = [...crew]; updated[i] = { ...updated[i], inline_instagram: e.target.value }; setCrew(updated)
                            }} className="form-input text-xs" />
                            <input placeholder="Website" value={c.inline_website || ''} onChange={e => {
                              const updated = [...crew]; updated[i] = { ...updated[i], inline_website: e.target.value }; setCrew(updated)
                            }} className="form-input text-xs" />
                          </div>
                        )}
                        {/* DB match indicator */}
                        {c.crew_id ? (
                          <div className="flex items-center gap-2 ml-2 text-[11px]">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 015.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" /></svg>
                              Linked: {linkedFromFuzzy?.title ?? c.inline_name} {linkedFromFuzzy ? `(${linkedFromFuzzy.score}%)` : `(#${c.crew_id})`}
                            </span>
                            {linkedFromFuzzy?.detail && <span className="text-gray-400">{linkedFromFuzzy.detail}</span>}
                            <button type="button" onClick={() => {
                              const updated = [...crew]; updated[i] = { ...updated[i], crew_id: null }; setCrew(updated)
                            }} className="text-gray-400 hover:text-red-500 underline">Unlink</button>
                          </div>
                        ) : matches.length > 0 ? (
                          <div className="ml-2 flex flex-wrap items-center gap-1 text-[11px]">
                            <span className="text-gray-400 font-medium">Match:</span>
                            {matches.slice(0, 3).map(m => (
                              <button key={m.id} type="button" onClick={() => {
                                const updated = [...crew]; updated[i] = { ...updated[i], crew_id: m.id }; setCrew(updated)
                              }} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors" title={m.detail || ''}>
                                {m.title} <span className="text-amber-500">{m.score}%</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      </DragHandleRow>
                    )
                  })}
                </div>
                <button type="button" onClick={() => setCrew(prev => [...prev, { role_name: '', inline_name: '' }])}
                  className="text-xs text-[#3ea8c8] hover:underline">+ Add Crew Member</button>
              </div>

              {/* Companies */}
              <div className="admin-card space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Companies ({companies.length})</h3>
                  {matchingEntities && <span className="text-[10px] text-gray-400 animate-pulse">Matching to database...</span>}
                </div>
                <div className="space-y-2">
                  {companies.map((c, i) => {
                    const matches = companyMatches[c.inline_name] ?? []
                    const linkedFromFuzzy = c.company_id ? matches.find(m => m.id === c.company_id) : null
                    return (
                      <DragHandleRow key={i} index={i} listId="scan-companies" onReorder={(from, to) => setCompanies(prev => reorderArray(prev, from, to))}>
                      <div className="space-y-1">
                        <div className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                          <div className="flex-1 grid grid-cols-3 gap-2">
                            <EntitySearchInput
                              type="company"
                              value={c.inline_name}
                              onChange={val => {
                                const updated = [...companies]; updated[i] = { ...updated[i], inline_name: val, company_id: null }; setCompanies(updated)
                              }}
                              onSelect={r => {
                                const updated = [...companies]; updated[i] = { ...updated[i], inline_name: r.title, company_id: r.id }; setCompanies(updated)
                              }}
                              isLinked={!!c.company_id}
                              placeholder="Company Name"
                              className="form-input text-sm"
                            />
                            <input placeholder="Address" value={c.inline_address || ''} onChange={e => {
                              const updated = [...companies]; updated[i] = { ...updated[i], inline_address: e.target.value }; setCompanies(updated)
                            }} className="form-input text-sm" />
                            <input placeholder="Email" value={c.inline_emails?.join(', ') || ''} onChange={e => {
                              const updated = [...companies]; updated[i] = { ...updated[i], inline_emails: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }; setCompanies(updated)
                            }} className="form-input text-sm" />
                          </div>
                          <OriginBadge origin={c.origin} confidence={c.confidence} />
                          <button type="button" onClick={() => removeCompanyRow(i)} className="text-red-400 hover:text-red-600 p-1 text-xs">&times;</button>
                        </div>
                        {/* Social & Action buttons */}
                        <div className="flex items-center gap-2 ml-2 mt-0.5 mb-1 pb-1 border-b border-gray-100">
                          <button type="button" onClick={() => toggleSocial(`company-${i}`)}
                            className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
                            <svg className={`w-3 h-3 transition-transform ${expandedSocial.has(`company-${i}`) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            Social & Web
                          </button>
                          <div className="ml-auto flex items-center gap-2">
                            {creatingListing[`company-${i}-saved`] && (
                              <span className="text-[11px] text-green-600 font-medium flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                Saved
                              </span>
                            )}
                            {c.company_id && c.inline_name && (
                              <button type="button" onClick={() => updateCompanyListing(i)}
                                disabled={creatingListing[`company-${i}`]}
                                className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                                {creatingListing[`company-${i}`] ? (
                                  <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Saving...</>
                                ) : (
                                  <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg> Update Listing</>
                                )}
                              </button>
                            )}
                            {!c.company_id && c.inline_name && (
                              <button type="button" onClick={() => createCompanyListing(i)}
                                disabled={creatingListing[`company-${i}`]}
                                className="text-[11px] text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
                                {creatingListing[`company-${i}`] ? (
                                  <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Creating...</>
                                ) : (
                                  <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> Create Listing</>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                        {expandedSocial.has(`company-${i}`) && (
                          <div className="ml-2 pt-1 pb-2 mb-1 border-b border-dashed border-gray-200 space-y-2">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <input placeholder="Phone (comma sep.)" value={c.inline_phones?.join(', ') || ''} onChange={e => {
                                const updated = [...companies]; updated[i] = { ...updated[i], inline_phones: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }; setCompanies(updated)
                              }} className="form-input text-xs" />
                              <input placeholder="Fax (comma sep.)" value={c.inline_faxes?.join(', ') || ''} onChange={e => {
                                const updated = [...companies]; updated[i] = { ...updated[i], inline_faxes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }; setCompanies(updated)
                              }} className="form-input text-xs" />
                              <input placeholder="LinkedIn" value={c.inline_linkedin || ''} onChange={e => {
                                const updated = [...companies]; updated[i] = { ...updated[i], inline_linkedin: e.target.value }; setCompanies(updated)
                              }} className="form-input text-xs" />
                              <input placeholder="Twitter / X" value={c.inline_twitter || ''} onChange={e => {
                                const updated = [...companies]; updated[i] = { ...updated[i], inline_twitter: e.target.value }; setCompanies(updated)
                              }} className="form-input text-xs" />
                              <input placeholder="Instagram" value={c.inline_instagram || ''} onChange={e => {
                                const updated = [...companies]; updated[i] = { ...updated[i], inline_instagram: e.target.value }; setCompanies(updated)
                              }} className="form-input text-xs" />
                              <input placeholder="Website" value={c.inline_website || ''} onChange={e => {
                                const updated = [...companies]; updated[i] = { ...updated[i], inline_website: e.target.value }; setCompanies(updated)
                              }} className="form-input text-xs" />
                            </div>
                          </div>
                        )}
                        {/* DB match indicator */}
                        {c.company_id ? (
                          <div className="flex items-center gap-2 ml-2 text-[11px]">
                            <Link
                              href={`/admin/companies/${c.company_id}/edit`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open company edit page in a new tab"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium hover:bg-green-200 hover:underline transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 015.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" /></svg>
                              Linked: {linkedFromFuzzy?.title ?? c.inline_name} {linkedFromFuzzy ? `(${linkedFromFuzzy.score}%)` : `(#${c.company_id})`}
                              <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            </Link>
                            {linkedFromFuzzy?.detail && <span className="text-gray-400">{linkedFromFuzzy.detail}</span>}
                            <button type="button" onClick={() => {
                              const updated = [...companies]; updated[i] = { ...updated[i], company_id: null }; setCompanies(updated)
                            }} className="text-gray-400 hover:text-red-500 underline">Unlink</button>
                          </div>
                        ) : matches.length > 0 ? (
                          <div className="ml-2 flex flex-wrap items-center gap-1 text-[11px]">
                            <span className="text-gray-400 font-medium">Match:</span>
                            {matches.slice(0, 3).map(m => (
                              <button key={m.id} type="button" onClick={() => {
                                const updated = [...companies]; updated[i] = { ...updated[i], company_id: m.id }; setCompanies(updated)
                              }} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors" title={m.detail || ''}>
                                {m.title} <span className="text-amber-500">{m.score}%</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      </DragHandleRow>
                    )
                  })}
                </div>
                <button type="button" onClick={() => setCompanies(prev => [...prev, { inline_name: '' }])}
                  className="text-xs text-[#3ea8c8] hover:underline">+ Add Company</button>
              </div>
            </div>

            {/* Sidebar — right column */}
            <div className="space-y-5">
              {/* Publish */}
              <div className="admin-card space-y-4">
                <h3 className="text-sm font-bold text-gray-900">Publish Settings</h3>
                <div>
                  <label className="form-label">Visibility</label>
                  <select name="visibility" defaultValue={updateMode ? 'publish' : 'draft'} className="form-input">
                    <option value="publish">Published</option>
                    <option value="members_only">Members Only</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Production Phase</label>
                  <select name="computed_status" value={computedStatus} onChange={e => setComputedStatus(e.target.value)} className="form-input">
                    <option value="">— Select —</option>
                    <option value="in-pre-production">Pre-Production</option>
                    <option value="in-production">In Production</option>
                    <option value="in-post-production">Post-Production</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={formPending || bulkSaving} className="btn-primary flex-1">
                    {(formPending || bulkSaving)
                      ? (updateMode ? 'Updating...' : 'Saving...')
                      : (updateMode ? 'Update Production' : bulkMode ? 'Save & Continue' : 'Create Production')}
                  </button>
                </div>
                {bulkMode && bulkResults.length > 0 && (
                  <button type="button" onClick={returnToBulkResults} className="btn-outline w-full text-sm flex items-center justify-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    Back to Bulk Results ({bulkResults.length - savedBulkIndices.size} remaining)
                  </button>
                )}
                {/* Blog post generation */}
                {blogResult?.saved ? (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-medium text-green-800">Blog draft created!</p>
                    <p className="text-xs text-green-600 mt-1">{blogResult.title}</p>
                    <Link href={`/admin/blog/${blogResult.blogPostId}/edit`}
                      className="inline-block mt-2 text-xs text-[#3ea8c8] hover:underline font-medium">
                      Edit blog post draft
                    </Link>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={generatingBlog}
                    onClick={async () => {
                      setGeneratingBlog(true)
                      setBlogResult(null)
                      try {
                        const res = await fetch('/api/admin/generate-blog-post', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            productionId: updateMode && existingProduction ? existingProduction.id : undefined,
                            productionData: {
                              title,
                              excerpt,
                              content,
                              computed_status: computedStatus,
                              production_date_start: dateStart,
                              production_date_end: dateEnd,
                              types: selectedTypeIds.map(id => typeOptions.find(t => t.id === id)?.name).filter(Boolean),
                              statuses: selectedStatusIds.map(id => statusOptions.find(s => s.id === id)?.name).filter(Boolean),
                              locations: locations.filter(l => l.city || l.location),
                              crew: crew.filter(c => c.inline_name),
                              companies: companies.filter(c => c.inline_name),
                            },
                          }),
                        })
                        const result = await res.json()
                        if (!res.ok) throw new Error(result.error || 'Generation failed')
                        setBlogResult({ saved: result.saved, blogPostId: result.blogPostId, title: result.blog?.title, error: result.saved ? undefined : result.error })
                      } catch (err: any) {
                        setBlogResult({ saved: false, error: err.message || 'Failed to generate blog post' })
                      }
                      setGeneratingBlog(false)
                    }}
                    className="btn-outline w-full text-sm flex items-center justify-center gap-2"
                  >
                    {generatingBlog ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Generating blog post...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Generate Blog Post Draft
                      </>
                    )}
                  </button>
                )}
                {blogResult?.error && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{blogResult.error}</div>
                )}

                <button type="button" onClick={resetAll} className="btn-outline w-full text-sm">
                  {bulkMode ? 'Discard All & Start Over' : 'Start Over'}
                </button>
              </div>

              {/* Types */}
              <div className="admin-card space-y-2">
                <h3 className="text-sm font-bold text-gray-900">Production Type</h3>
                <div className="flex flex-wrap gap-1.5">
                  {typeOptions.map(t => (
                    <button key={t.id} type="button" onClick={() => {
                      const ids = selectedTypeIds.includes(t.id)
                        ? selectedTypeIds.filter(id => id !== t.id)
                        : [...selectedTypeIds, t.id]
                      setSelectedTypeIds(ids)
                      if (!ids.includes(primaryTypeId!)) setPrimaryTypeId(ids[0] || null)
                    }} className={`px-2 py-1 text-xs rounded-md font-medium border transition-colors ${
                      selectedTypeIds.includes(t.id)
                        ? 'bg-[#3ea8c8] text-white border-[#3ea8c8]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Statuses */}
              <div className="admin-card space-y-2">
                <h3 className="text-sm font-bold text-gray-900">Production Status</h3>
                <div className="flex flex-wrap gap-1.5">
                  {statusOptions.map(s => (
                    <button key={s.id} type="button" onClick={() => {
                      const ids = selectedStatusIds.includes(s.id)
                        ? selectedStatusIds.filter(id => id !== s.id)
                        : [...selectedStatusIds, s.id]
                      setSelectedStatusIds(ids)
                      if (!ids.includes(primaryStatusId!)) setPrimaryStatusId(ids[0] || null)
                    }} className={`px-2 py-1 text-xs rounded-md font-medium border transition-colors ${
                      selectedStatusIds.includes(s.id)
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="admin-card space-y-3">
                <h3 className="text-sm font-bold text-gray-900">Dates</h3>
                <div>
                  <label className="form-label text-xs">Production Start</label>
                  <input type="date" name="production_date_start" value={dateStart}
                    onChange={e => setDateStart(e.target.value)} className="form-input text-sm" />
                </div>
                <div>
                  <label className="form-label text-xs">Production End</label>
                  <input type="date" name="production_date_end" value={dateEnd}
                    onChange={e => setDateEnd(e.target.value)} className="form-input text-sm" />
                </div>
              </div>

              {/* Research summary */}
              {researchData && (
                <div className="admin-card bg-amber-50 border-amber-200">
                  <h3 className="text-sm font-bold text-amber-900 mb-2">AI Research Summary</h3>
                  {researchData.searched_but_not_found?.length > 0 && (
                    <div className="text-xs text-amber-700">
                      <p className="font-medium mb-1">Searched but not found:</p>
                      <p>{researchData.searched_but_not_found.join(', ')}</p>
                    </div>
                  )}
                  {researchData.additional_notes && (
                    <p className="text-xs text-amber-800 mt-2">{researchData.additional_notes}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </form>
      )}
    </div>
  )
}
