'use client'

import { useState, useCallback, useRef, useEffect, useActionState } from 'react'
import { saveProduction } from '@/app/admin/productions/actions'
import { EntitySearchInput } from '@/components/admin/EntitySearchInput'
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
  confidence?: number; status?: string; source?: string; origin?: 'scan' | 'research'
}
interface CompanyRow {
  inline_name: string; inline_address?: string; company_id?: number | null
  inline_phones?: string[]; inline_faxes?: string[]; inline_emails?: string[]; inline_linkedin?: string
  confidence?: number; source?: string; origin?: 'scan' | 'research'
}

interface DuplicateMatch {
  id: number; title: string; slug: string; types: string[]; statuses: string[]
  similarity_score: number; is_same_season: boolean; season_info: string | null
}

type Step = 'upload' | 'extracting' | 'duplicates' | 'compare' | 'research' | 'review'

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

export function ScannerWorkflow({ typeOptions, statusOptions }: ScannerWorkflowProps) {
  const [step, setStep] = useState<Step>('upload')
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

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
    setUpdateMode(false)
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
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f) }} />
            <svg className="w-16 h-16 text-[#3ea8c8]/40 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <p className="text-lg font-semibold text-gray-700 mb-1">Drop a production listing screenshot</p>
            <p className="text-sm text-gray-400">or click to browse — paste from clipboard with Ctrl+V</p>
          </div>
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
            <span className="text-lg font-semibold">AI is reading your screenshot...</span>
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
              <button onClick={resetAll} className="btn-outline text-sm">
                Start Over
              </button>
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
                  {researching ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Researching across industry sources...
                    </span>
                  ) : 'Research & Enrich with AI'}
                </button>
                <button onClick={() => setStep('review')} className="btn-outline text-sm">
                  Skip — Go to Review
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 5: REVIEW & CREATE ═══ */}
      {step === 'review' && (
        <form action={formAction} className="space-y-5">
          {formState?.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{formState.error}</div>
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
                      <div key={i} className="space-y-1">
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
                      <div key={i} className="space-y-1">
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
                        {/* DB match indicator */}
                        {c.company_id ? (
                          <div className="flex items-center gap-2 ml-2 text-[11px]">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 015.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" /></svg>
                              Linked: {linkedFromFuzzy?.title ?? c.inline_name} {linkedFromFuzzy ? `(${linkedFromFuzzy.score}%)` : `(#${c.company_id})`}
                            </span>
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
                  <button type="submit" disabled={formPending} className="btn-primary flex-1">
                    {formPending
                      ? (updateMode ? 'Updating...' : 'Creating...')
                      : (updateMode ? 'Update Production' : 'Create Production')}
                  </button>
                </div>
                <button type="button" onClick={resetAll} className="btn-outline w-full text-sm">Start Over</button>
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
