'use client'

import { useActionState, useState, useCallback, useEffect, useRef } from 'react'
import { saveProduction } from '@/app/admin/productions/actions'
import Link from 'next/link'
import { ImageScanner } from '@/components/admin/ImageScanner'
import { EntitySearchInput } from '@/components/admin/EntitySearchInput'
import { DragHandleRow, reorderArray } from '@/components/admin/DragHandle'

interface LocationRow {
  location: string
  city: string
  stage: string
  country: string
}

interface CrewRow {
  role_name: string
  inline_name: string
  crew_id?: number | null
  inline_phones?: string[]
  inline_emails?: string[]
  inline_linkedin?: string
  inline_twitter?: string
  inline_instagram?: string
  inline_website?: string
}

interface CompanyRow {
  inline_name: string
  inline_address?: string
  company_id?: number | null
  inline_phones?: string[]
  inline_faxes?: string[]
  inline_emails?: string[]
  inline_linkedin?: string
  inline_twitter?: string
  inline_instagram?: string
  inline_website?: string
}

interface MatchCandidate {
  id: number
  title: string
  slug: string
  score: number
  detail?: string
}

interface TypeOption { id: number; name: string; slug: string }
interface StatusOption { id: number; name: string; slug: string }

interface ProductionFormProps {
  production?: any
  typeOptions: TypeOption[]
  statusOptions: StatusOption[]
}

const VISIBILITY_OPTIONS = [
  { value: 'publish', label: 'Published' },
  { value: 'members_only', label: 'Members Only' },
  { value: 'draft', label: 'Draft' },
]

const PHASE_OPTIONS = [
  { value: 'in-pre-production', label: 'Pre-Production' },
  { value: 'in-production', label: 'In Production' },
  { value: 'in-post-production', label: 'Post-Production' },
  { value: 'completed', label: 'Completed' },
]

const emptyLocation = (): LocationRow => ({ location: '', city: '', stage: '', country: '' })
const emptyCrew = (): CrewRow => ({ role_name: '', inline_name: '' })
const emptyCompany = (): CompanyRow => ({ inline_name: '' })

// ── Match badge colors by confidence ──
function scoreBadge(score: number) {
  if (score >= 90) return 'bg-green-100 text-green-700 border-green-300'
  if (score >= 70) return 'bg-yellow-100 text-yellow-700 border-yellow-300'
  return 'bg-gray-100 text-gray-600 border-gray-300'
}

export function ProductionForm({ production, typeOptions, statusOptions }: ProductionFormProps) {
  const [state, action, pending] = useActionState(saveProduction, null)
  const [scannedData, setScannedData] = useState<any>(null)

  // Blog generation state
  const [generatingBlog, setGeneratingBlog] = useState(false)
  const [blogResult, setBlogResult] = useState<{ saved: boolean; blogPostId?: number; blogSlug?: string; title?: string; error?: string } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Entity match state
  const [companyMatches, setCompanyMatches] = useState<Record<string, MatchCandidate[]>>({})
  const [crewMatches, setCrewMatches] = useState<Record<string, MatchCandidate[]>>({})
  const [matchLoading, setMatchLoading] = useState(false)
  // Track which matches have been dismissed by the user
  const [dismissedCompanyMatches, setDismissedCompanyMatches] = useState<Set<string>>(new Set())
  const [dismissedCrewMatches, setDismissedCrewMatches] = useState<Set<string>>(new Set())

  // Extract existing relational data
  const existingTypeIds = (production?.production_type_links ?? []).map((l: any) => l.production_types?.id).filter(Boolean)
  const existingPrimaryTypeId = (production?.production_type_links ?? []).find((l: any) => l.is_primary)?.production_types?.id ?? existingTypeIds[0] ?? null
  const existingStatusIds = (production?.production_status_links ?? []).map((l: any) => l.production_statuses?.id).filter(Boolean)
  const existingPrimaryStatusId = (production?.production_status_links ?? []).find((l: any) => l.is_primary)?.production_statuses?.id ?? existingStatusIds[0] ?? null

  const existingLocations: LocationRow[] = (production?.production_locations ?? [])
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((l: any) => ({ location: l.location ?? '', city: l.city ?? '', stage: l.stage ?? '', country: l.country ?? '' }))

  const existingCrew: CrewRow[] = (production?.production_crew_roles ?? [])
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((c: any) => ({
      role_name: c.role_name ?? '',
      inline_name: c.inline_name ?? c.crew_members?.name ?? '',
      crew_id: c.crew_id ?? null,
      inline_phones: c.inline_phones ?? [],
      inline_emails: c.inline_emails ?? [],
      inline_linkedin: c.inline_linkedin ?? '',
      inline_twitter: c.inline_twitter ?? '',
      inline_instagram: c.inline_instagram ?? '',
      inline_website: c.inline_website ?? '',
    }))

  const existingCompanies: CompanyRow[] = (production?.production_company_links ?? [])
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((c: any) => ({
      inline_name: c.inline_name ?? c.companies?.title ?? '',
      inline_address: c.inline_address ?? '',
      company_id: c.company_id ?? null,
      inline_phones: c.inline_phones ?? [],
      inline_faxes: c.inline_faxes ?? [],
      inline_emails: c.inline_emails ?? [],
      inline_linkedin: c.inline_linkedin ?? '',
      inline_twitter: c.inline_twitter ?? '',
      inline_instagram: c.inline_instagram ?? '',
      inline_website: c.inline_website ?? '',
    }))

  // State for repeatable sections
  const [selectedTypeIds, setSelectedTypeIds] = useState<number[]>(existingTypeIds)
  const [primaryTypeId, setPrimaryTypeId] = useState<number | null>(existingPrimaryTypeId)
  const [selectedStatusIds, setSelectedStatusIds] = useState<number[]>(existingStatusIds)
  const [primaryStatusId, setPrimaryStatusId] = useState<number | null>(existingPrimaryStatusId)
  const [locations, setLocations] = useState<LocationRow[]>(existingLocations.length > 0 ? existingLocations : [emptyLocation()])
  const [crew, setCrew] = useState<CrewRow[]>(existingCrew.length > 0 ? existingCrew : [emptyCrew()])
  const [companies, setCompanies] = useState<CompanyRow[]>(existingCompanies.length > 0 ? existingCompanies : [emptyCompany()])

  // ── Fetch entity matches after scan ──
  const fetchMatches = useCallback(async (companyNames: string[], crewNames: string[]) => {
    if (companyNames.length === 0 && crewNames.length === 0) return
    setMatchLoading(true)
    setDismissedCompanyMatches(new Set())
    setDismissedCrewMatches(new Set())
    try {
      const res = await fetch('/api/admin/match-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companies: companyNames, crew: crewNames }),
      })
      if (res.ok) {
        const data = await res.json()
        setCompanyMatches(data.companyMatches ?? {})
        setCrewMatches(data.crewMatches ?? {})
      }
    } catch {
      // silently fail — matching is optional
    } finally {
      setMatchLoading(false)
    }
  }, [])

  // Auto-match unlinked crew/companies on form load (existing productions)
  const hasAutoMatched = useRef(false)
  useEffect(() => {
    if (hasAutoMatched.current || !production) return
    hasAutoMatched.current = true

    const unlinkedCrewNames = existingCrew
      .filter(c => !c.crew_id && c.inline_name)
      .map(c => c.inline_name)
    const unlinkedCompanyNames = existingCompanies
      .filter(c => !c.company_id && c.inline_name)
      .map(c => c.inline_name)

    if (unlinkedCrewNames.length > 0 || unlinkedCompanyNames.length > 0) {
      fetchMatches(unlinkedCompanyNames, unlinkedCrewNames)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleScan = useCallback((data: any) => {
    setScannedData(data)

    // --- Map production types by name match ---
    if (data.production_types?.length) {
      const matchedIds: number[] = []
      for (const typeName of data.production_types) {
        const match = typeOptions.find(t =>
          t.name.toLowerCase() === String(typeName).toLowerCase()
        )
        if (match) matchedIds.push(match.id)
      }
      if (matchedIds.length > 0) {
        setSelectedTypeIds(matchedIds)
        setPrimaryTypeId(matchedIds[0])
      }
    }

    // --- Map production statuses by name match ---
    if (data.production_statuses?.length) {
      const matchedIds: number[] = []
      for (const statusName of data.production_statuses) {
        const match = statusOptions.find(s =>
          s.name.toLowerCase() === String(statusName).toLowerCase()
        )
        if (match) matchedIds.push(match.id)
      }
      if (matchedIds.length > 0) {
        setSelectedStatusIds(matchedIds)
        setPrimaryStatusId(matchedIds[0])
      }
    }

    // --- Map locations ---
    if (data.locations?.length) {
      setLocations(data.locations.map((loc: any) => ({
        location: loc.location || '',
        city: loc.city || '',
        stage: loc.stage || '',
        country: loc.country || '',
      })))
    }

    // --- Map crew ---
    const scannedCrew: CrewRow[] = []
    if (data.crew?.length) {
      for (const c of data.crew) {
        scannedCrew.push({
          role_name: c.role_name || c.role || '',
          inline_name: c.inline_name || c.name || '',
          inline_phones: c.inline_phones || (c.phone ? [c.phone] : []),
          inline_emails: c.inline_emails || (c.email ? [c.email] : []),
          inline_linkedin: c.inline_linkedin || '',
        })
      }
      setCrew(scannedCrew)
    }

    // --- Map companies ---
    const scannedCompanies: CompanyRow[] = []
    if (data.companies?.length) {
      for (const c of data.companies) {
        scannedCompanies.push({
          inline_name: c.inline_name || c.name || '',
          inline_address: c.inline_address || [c.address, c.city_state_zip].filter(Boolean).join(', ') || '',
          inline_phones: c.inline_phones || (c.phone ? [c.phone] : []),
          inline_faxes: c.inline_faxes || (c.fax ? [c.fax] : []),
          inline_emails: c.inline_emails || (c.email ? [c.email] : []),
          inline_linkedin: c.inline_linkedin || '',
        })
      }
      setCompanies(scannedCompanies)
    }

    // --- Fire off match search ---
    const companyNames = scannedCompanies.map(c => c.inline_name).filter(Boolean)
    const crewNames = scannedCrew.map(c => c.inline_name).filter(Boolean)
    fetchMatches(companyNames, crewNames)
  }, [typeOptions, statusOptions, fetchMatches])

  const v = (key: string, fallback: string = '') => {
    if (scannedData?.[key] != null) return String(scannedData[key])
    return production?.[key] ?? fallback
  }

  // Type checkbox toggle
  const toggleType = (id: number) => {
    setSelectedTypeIds(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }
  const toggleStatus = (id: number) => {
    setSelectedStatusIds(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  // Location helpers
  const updateLocation = (i: number, field: keyof LocationRow, val: string) => {
    setLocations(prev => prev.map((loc, idx) => idx === i ? { ...loc, [field]: val } : loc))
  }
  const removeLocation = (i: number) => setLocations(prev => prev.filter((_, idx) => idx !== i))
  const addLocation = () => setLocations(prev => [...prev, emptyLocation()])

  // Crew helpers
  const updateCrew = (i: number, field: keyof CrewRow, val: any) => {
    setCrew(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c))
  }
  const removeCrew = (i: number) => setCrew(prev => prev.filter((_, idx) => idx !== i))
  const addCrew = () => setCrew(prev => [...prev, emptyCrew()])

  // Company helpers
  const updateCompany = (i: number, field: keyof CompanyRow, val: any) => {
    setCompanies(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c))
  }
  const removeCompany = (i: number) => setCompanies(prev => prev.filter((_, idx) => idx !== i))
  const addCompany = () => setCompanies(prev => [...prev, emptyCompany()])

  // Link company to existing DB record
  const linkCompany = (index: number, match: MatchCandidate) => {
    setCompanies(prev => prev.map((c, i) => i === index ? {
      ...c,
      company_id: match.id,
      inline_name: match.title, // use the canonical DB name
    } : c))
    // Dismiss the suggestion
    setDismissedCompanyMatches(prev => new Set([...prev, companies[index].inline_name]))
  }

  // Unlink company
  const unlinkCompany = (index: number) => {
    setCompanies(prev => prev.map((c, i) => i === index ? { ...c, company_id: null } : c))
  }

  // Link crew to existing DB record
  const linkCrew = (index: number, match: MatchCandidate) => {
    setCrew(prev => prev.map((c, i) => i === index ? {
      ...c,
      crew_id: match.id,
      inline_name: match.title,
    } : c))
    setDismissedCrewMatches(prev => new Set([...prev, crew[index].inline_name]))
  }

  // Unlink crew
  const unlinkCrew = (index: number) => {
    setCrew(prev => prev.map((c, i) => i === index ? { ...c, crew_id: null } : c))
  }

  // Get matches for a company name
  const getCompanyMatchesFor = (name: string): MatchCandidate[] => {
    if (!name || dismissedCompanyMatches.has(name)) return []
    return companyMatches[name] ?? []
  }

  // Get matches for a crew name
  const getCrewMatchesFor = (name: string): MatchCandidate[] => {
    if (!name || dismissedCrewMatches.has(name)) return []
    return crewMatches[name] ?? []
  }

  // State for creating listings inline
  const [creatingListing, setCreatingListing] = useState<Record<string, boolean>>({})

  // Create a crew member listing from inline data
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
          type: 'crew',
          name: c.inline_name,
          phones: c.inline_phones,
          emails: c.inline_emails,
          linkedin: c.inline_linkedin,
          twitter: c.inline_twitter,
          instagram: c.inline_instagram,
          website: c.inline_website,
          role_name: c.role_name,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // Link the crew row to the newly created record
      setCrew(prev => prev.map((cr, i) => i === index ? { ...cr, crew_id: data.id, inline_name: data.title } : cr))
    } catch (err: any) {
      alert(`Failed to create crew listing: ${err.message}`)
    } finally {
      setCreatingListing(prev => ({ ...prev, [key]: false }))
    }
  }

  // Create a company listing from inline data
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
          type: 'company',
          name: c.inline_name,
          address: c.inline_address,
          phones: c.inline_phones,
          faxes: c.inline_faxes,
          emails: c.inline_emails,
          linkedin: c.inline_linkedin,
          twitter: c.inline_twitter,
          instagram: c.inline_instagram,
          website: c.inline_website,
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

  // Update an existing crew member listing
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
          type: 'crew', id: c.crew_id, name: c.inline_name,
          phones: c.inline_phones, emails: c.inline_emails,
          linkedin: c.inline_linkedin, twitter: c.inline_twitter,
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

  // Update an existing company listing
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
          type: 'company', id: c.company_id, name: c.inline_name,
          address: c.inline_address, phones: c.inline_phones,
          faxes: c.inline_faxes, emails: c.inline_emails,
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

  // Track per-row AI research state for the company section
  const [researchingCompany, setResearchingCompany] = useState<Record<number, boolean>>({})

  // Use Claude to research a company and autofill empty fields only
  const researchCompany = async (index: number) => {
    const c = companies[index]
    if (!c.inline_name?.trim()) {
      alert('Enter a company name first')
      return
    }
    setResearchingCompany(prev => ({ ...prev, [index]: true }))
    try {
      const res = await fetch('/api/admin/ai-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'company',
          name: c.inline_name,
          existingData: {
            address: c.inline_address || undefined,
            phones: c.inline_phones?.length ? c.inline_phones : undefined,
            emails: c.inline_emails?.length ? c.inline_emails : undefined,
            website: c.inline_website || undefined,
            linkedin: c.inline_linkedin || undefined,
            twitter: c.inline_twitter || undefined,
            instagram: c.inline_instagram || undefined,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Research failed')

      const d = json.data ?? {}
      // Only fill EMPTY fields — never overwrite admin-entered data
      setCompanies(prev => prev.map((co, i) => {
        if (i !== index) return co
        const merged: CompanyRow = { ...co }
        if (!merged.inline_address && d.address) merged.inline_address = String(d.address)
        if ((!merged.inline_phones || merged.inline_phones.length === 0) && d.phone) merged.inline_phones = [String(d.phone)]
        if ((!merged.inline_emails || merged.inline_emails.length === 0) && d.email) merged.inline_emails = [String(d.email)]
        if (!merged.inline_website && d.website) merged.inline_website = String(d.website)
        if (!merged.inline_linkedin && d.linkedin) merged.inline_linkedin = String(d.linkedin)
        if (!merged.inline_twitter && d.twitter) merged.inline_twitter = String(d.twitter)
        if (!merged.inline_instagram && d.instagram) merged.inline_instagram = String(d.instagram)
        return merged
      }))
      // Auto-expand social section so admin can see what was filled
      setExpandedSocial(prev => new Set([...prev, `company-${index}`]))
    } catch (err: any) {
      alert(`AI research failed: ${err.message}`)
    } finally {
      setResearchingCompany(prev => ({ ...prev, [index]: false }))
    }
  }

  // AI Enrich state
  const [enriching, setEnriching] = useState(false)
  const [enrichResult, setEnrichResult] = useState<{ count: number; error?: string } | null>(null)
  const [aiHighlights, setAiHighlights] = useState<Set<string>>(new Set())

  const handleEnrich = async () => {
    // Get the current title from the form
    const currentTitle = production?.title || scannedData?.title || ''
    if (!currentTitle) {
      setEnrichResult({ count: 0, error: 'Save or scan a title first before enriching.' })
      return
    }

    setEnriching(true)
    setEnrichResult(null)
    try {
      // Gather ALL existing data as context for the AI
      const form = formRef.current
      const currentExcerpt = form ? (form.elements.namedItem('excerpt') as HTMLTextAreaElement)?.value : production?.excerpt
      const currentContent = form ? (form.elements.namedItem('content') as HTMLTextAreaElement)?.value : production?.content
      const currentPhase = form ? (form.elements.namedItem('computed_status') as HTMLSelectElement)?.value : production?.computed_status
      const currentDateStart = form ? (form.elements.namedItem('production_date_start') as HTMLInputElement)?.value : production?.production_date_start
      const currentDateEnd = form ? (form.elements.namedItem('production_date_end') as HTMLInputElement)?.value : production?.production_date_end

      const existingData: any = {
        title: currentTitle,
        synopsis: currentExcerpt || undefined,
        additional_notes: currentContent || undefined,
        production_phase: currentPhase || undefined,
        production_date_start: currentDateStart || undefined,
        production_date_end: currentDateEnd || undefined,
        production_types: selectedTypeIds.map(id => typeOptions.find(t => t.id === id)?.name).filter(Boolean),
        production_statuses: selectedStatusIds.map(id => statusOptions.find(s => s.id === id)?.name).filter(Boolean),
        crew: crew.filter(c => c.inline_name).map(c => ({ role_name: c.role_name, inline_name: c.inline_name })),
        companies: companies.filter(c => c.inline_name).map(c => ({ inline_name: c.inline_name })),
        locations: locations.filter(l => l.city || l.location).map(l => ({ city: l.city, location: l.location, stage: l.stage, country: l.country })),
      }

      // Remove empty arrays/undefined to keep the context clean
      for (const key of Object.keys(existingData)) {
        const val = existingData[key]
        if (val === undefined || (Array.isArray(val) && val.length === 0)) {
          delete existingData[key]
        }
      }

      const res = await fetch('/api/admin/ai-research-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: currentTitle, existingData }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Research failed')

      const data = result.data
      let fieldsAdded = 0
      const newHighlights = new Set<string>()

      // Merge synopsis/content if empty
      if (data.synopsis) {
        const excerptEl = formRef.current?.querySelector('[name="excerpt"]') as HTMLTextAreaElement | null
        if (excerptEl && !excerptEl.value.trim()) {
          excerptEl.value = data.synopsis
          fieldsAdded++
          newHighlights.add('excerpt')
        }
      }
      if (data.additional_notes) {
        const contentEl = formRef.current?.querySelector('[name="content"]') as HTMLTextAreaElement | null
        if (contentEl && !contentEl.value.trim()) {
          contentEl.value = data.additional_notes
          fieldsAdded++
          newHighlights.add('content')
        }
      }

      // Merge dates if empty
      if (data.production_date_start) {
        const dateEl = formRef.current?.querySelector('[name="production_date_start"]') as HTMLInputElement | null
        if (dateEl && !dateEl.value) {
          dateEl.value = data.production_date_start
          fieldsAdded++
          newHighlights.add('production_date_start')
        }
      }
      if (data.production_date_end) {
        const dateEl = formRef.current?.querySelector('[name="production_date_end"]') as HTMLInputElement | null
        if (dateEl && !dateEl.value) {
          dateEl.value = data.production_date_end
          fieldsAdded++
          newHighlights.add('production_date_end')
        }
      }

      // Merge types
      if (data.production_types?.length && selectedTypeIds.length === 0) {
        const matchedIds: number[] = []
        for (const typeName of data.production_types) {
          const match = typeOptions.find(t => t.name.toLowerCase() === String(typeName).toLowerCase())
          if (match) matchedIds.push(match.id)
        }
        if (matchedIds.length > 0) {
          setSelectedTypeIds(matchedIds)
          setPrimaryTypeId(matchedIds[0])
          fieldsAdded++
          newHighlights.add('types')
        }
      }

      // Merge statuses
      if (data.production_statuses?.length && selectedStatusIds.length === 0) {
        const matchedIds: number[] = []
        for (const statusName of data.production_statuses) {
          const match = statusOptions.find(s => s.name.toLowerCase() === String(statusName).toLowerCase())
          if (match) matchedIds.push(match.id)
        }
        if (matchedIds.length > 0) {
          setSelectedStatusIds(matchedIds)
          setPrimaryStatusId(matchedIds[0])
          fieldsAdded++
          newHighlights.add('statuses')
        }
      }

      // Track how many locations/crew/companies existed before merge
      const locCountBefore = locations.filter(l => l.location || l.city).length
      const crewCountBefore = crew.filter(c => c.role_name || c.inline_name).length
      const companyCountBefore = companies.filter(c => c.inline_name).length

      // Merge new locations (add any the AI found that we don't have)
      if (data.locations?.length) {
        const existingCities = new Set(locations.map(l => l.city.toLowerCase()).filter(Boolean))
        const newLocs = data.locations
          .filter((loc: any) => loc.city && !existingCities.has(loc.city.toLowerCase()))
          .map((loc: any) => ({
            location: loc.location || '', city: loc.city || '',
            stage: loc.stage || '', country: loc.country || '',
          }))
        if (newLocs.length > 0) {
          setLocations(prev => {
            const cleaned = prev.filter(l => l.location || l.city)
            return [...cleaned, ...newLocs]
          })
          fieldsAdded += newLocs.length
          // Mark each new location row by index
          for (let li = 0; li < newLocs.length; li++) {
            newHighlights.add(`location-${locCountBefore + li}`)
          }
        }
      }

      // Merge new crew (add any the AI found that we don't have)
      if (data.crew?.length) {
        const existingNames = new Set(crew.map(c => c.inline_name.toLowerCase()).filter(Boolean))
        const newCrew = data.crew
          .filter((c: any) => (c.inline_name || c.name) && !existingNames.has((c.inline_name || c.name).toLowerCase()))
          .map((c: any) => ({
            role_name: c.role_name || c.role || '',
            inline_name: c.inline_name || c.name || '',
            inline_phones: c.inline_phones || [],
            inline_emails: c.inline_emails || [],
            inline_linkedin: c.inline_linkedin || '',
          }))
        if (newCrew.length > 0) {
          setCrew(prev => {
            const cleaned = prev.filter(c => c.role_name || c.inline_name)
            return [...cleaned, ...newCrew]
          })
          fieldsAdded += newCrew.length
          for (let ci = 0; ci < newCrew.length; ci++) {
            newHighlights.add(`crew-${crewCountBefore + ci}`)
          }
          // Run entity matching on the new crew
          const crewNames = newCrew.map((c: CrewRow) => c.inline_name).filter(Boolean)
          if (crewNames.length > 0) fetchMatches([], crewNames)
        }
      }

      // Merge new companies
      if (data.companies?.length) {
        const existingNames = new Set(companies.map(c => c.inline_name.toLowerCase()).filter(Boolean))
        const newCompanies = data.companies
          .filter((c: any) => (c.inline_name || c.name) && !existingNames.has((c.inline_name || c.name).toLowerCase()))
          .map((c: any) => ({
            inline_name: c.inline_name || c.name || '',
            inline_address: c.inline_address || '',
            inline_phones: c.inline_phones || [],
            inline_faxes: c.inline_faxes || [],
            inline_emails: c.inline_emails || [],
            inline_linkedin: c.inline_linkedin || '',
          }))
        if (newCompanies.length > 0) {
          setCompanies(prev => {
            const cleaned = prev.filter(c => c.inline_name)
            return [...cleaned, ...newCompanies]
          })
          fieldsAdded += newCompanies.length
          for (let ci = 0; ci < newCompanies.length; ci++) {
            newHighlights.add(`company-${companyCountBefore + ci}`)
          }
          const companyNames = newCompanies.map((c: CompanyRow) => c.inline_name).filter(Boolean)
          if (companyNames.length > 0) fetchMatches(companyNames, [])
        }
      }

      setAiHighlights(newHighlights)
      setEnrichResult({ count: fieldsAdded })
    } catch (err: any) {
      setEnrichResult({ count: 0, error: err.message || 'Enrichment failed' })
    } finally {
      setEnriching(false)
    }
  }

  // Track which crew/company rows have expanded social fields
  const [expandedSocial, setExpandedSocial] = useState<Set<string>>(new Set())
  const toggleSocial = (key: string) => {
    setExpandedSocial(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /** Purple ring + background for AI-enriched fields */
  const aiRing = (key: string) =>
    aiHighlights.has(key) ? 'ring-2 ring-purple-400 bg-purple-50/50' : ''
  const aiRowBg = (key: string) =>
    aiHighlights.has(key) ? 'bg-purple-50 ring-1 ring-purple-300 rounded-lg p-2 -m-2' : ''
  const aiBadge = (key: string) =>
    aiHighlights.has(key) ? (
      <span className="ml-2 text-[10px] font-bold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider">AI</span>
    ) : null

  return (
    <form ref={formRef} action={action} className="space-y-6 max-w-4xl" key={scannedData ? 'scanned' : 'default'}>
      {production && <input type="hidden" name="id" value={production.id} />}

      {/* Hidden JSON fields for repeatable sections */}
      {selectedTypeIds.map(tid => (
        <input key={`type-${tid}`} type="hidden" name="type_ids" value={tid} />
      ))}
      <input type="hidden" name="primary_type_id" value={primaryTypeId ?? ''} />
      {selectedStatusIds.map(sid => (
        <input key={`status-${sid}`} type="hidden" name="status_ids" value={sid} />
      ))}
      <input type="hidden" name="primary_status_id" value={primaryStatusId ?? ''} />
      <input type="hidden" name="locations_json" value={JSON.stringify(locations.filter(l => l.location || l.city))} />
      <input type="hidden" name="crew_json" value={JSON.stringify(crew.filter(c => c.role_name || c.inline_name))} />
      <input type="hidden" name="companies_json" value={JSON.stringify(companies.filter(c => c.inline_name))} />

      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* AI Tools — available on both new and edit */}
      <div className="admin-card space-y-3">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          AI Tools
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleEnrich}
            disabled={enriching}
            className="inline-flex items-center gap-2 text-sm font-medium bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {enriching ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Researching...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Enrich with AI
              </>
            )}
          </button>
          <ImageScanner type="production" onScanComplete={handleScan} />
        </div>
        <p className="text-xs text-gray-400">
          AI Research searches industry sources for crew, companies, dates, locations, and synopsis.
        </p>

        {enrichResult && (
          <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
            enrichResult.error
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-purple-50 border border-purple-200 text-purple-700'
          }`}>
            {enrichResult.error ? (
              <>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {enrichResult.error}
              </>
            ) : (
              <>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                AI research added <strong>{enrichResult.count}</strong> new data point{enrichResult.count !== 1 ? 's' : ''}. Review and save.
              </>
            )}
          </div>
        )}
      </div>

      {scannedData && (
        <div className="p-3 bg-[#3ea8c8]/10 border border-[#3ea8c8]/30 rounded-lg text-sm text-[#2a7a94] flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>
            AI populated fields from screenshot —
            <strong>
              {[
                selectedTypeIds.length > 0 && `${selectedTypeIds.length} type(s)`,
                selectedStatusIds.length > 0 && `${selectedStatusIds.length} status(es)`,
                locations.filter(l => l.location || l.city).length > 0 && `${locations.filter(l => l.location || l.city).length} location(s)`,
                companies.filter(c => c.inline_name).length > 0 && `${companies.filter(c => c.inline_name).length} company/ies`,
                crew.filter(c => c.role_name || c.inline_name).length > 0 && `${crew.filter(c => c.role_name || c.inline_name).length} crew`,
              ].filter(Boolean).join(', ')}
            </strong>
            . Review and adjust before saving.
            {matchLoading && (
              <span className="ml-2 inline-flex items-center gap-1 text-[#3ea8c8]">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Matching against database…
              </span>
            )}
          </span>
        </div>
      )}

      {/* ── Basic Info ── */}
      <div className="admin-card space-y-4">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>
          Basic Info
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="form-label">Title *</label>
            <input name="title" required defaultValue={v('title')} className="form-input" placeholder="e.g. Elsbeth - Series (Season 04)" />
          </div>

          <div>
            <label className="form-label">Slug</label>
            <input name="slug" defaultValue={v('slug')} className="form-input" placeholder="auto-generated-from-title" />
            <p className="text-xs text-gray-400 mt-1">Leave blank to auto-generate.</p>
          </div>

          <div>
            <label className="form-label">Visibility</label>
            <select name="visibility" defaultValue={v('visibility', 'publish')} className="form-input">
              {VISIBILITY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="form-label">Production Phase</label>
          <select name="computed_status" defaultValue={v('computed_status', '')} className="form-input max-w-xs">
            <option value="">— Select —</option>
            {PHASE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="form-label">Excerpt / Logline{aiBadge('excerpt')}</label>
          <textarea name="excerpt" rows={2} defaultValue={v('excerpt')} className={`form-textarea ${aiRing('excerpt')}`} placeholder="Brief logline or one-sentence description" />
        </div>

        <div>
          <label className="form-label">Description / Notes{aiBadge('content')}</label>
          <textarea name="content" rows={6} defaultValue={v('content')} className={`form-textarea ${aiRing('content')}`} placeholder="Full description, plot synopsis, or additional notes" />
        </div>
      </div>

      {/* ── Production Type & Status ── */}
      <div className="admin-card space-y-4">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
          Type & Status
        </h2>

        <div>
          <label className="form-label">Production Type(s){aiBadge('types')}</label>
          <div className={`flex flex-wrap gap-2 mt-1 ${aiHighlights.has('types') ? 'ring-2 ring-purple-300 bg-purple-50/50 rounded-lg p-2' : ''}`}>
            {typeOptions.map(t => (
              <label key={t.id}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${
                  selectedTypeIds.includes(t.id) ? 'bg-primary/10 border-primary text-primary' : 'border-gray-300 text-gray-600 hover:border-gray-400'
                }`}
              >
                <input type="checkbox" className="sr-only" checked={selectedTypeIds.includes(t.id)}
                  onChange={() => toggleType(t.id)} />
                {t.name}
                {selectedTypeIds.includes(t.id) && selectedTypeIds.length > 1 && (
                  <button type="button" onClick={(e) => { e.preventDefault(); setPrimaryTypeId(t.id) }}
                    className={`ml-1 text-[10px] px-1 rounded ${primaryTypeId === t.id ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}
                    title="Set as primary"
                  >
                    {primaryTypeId === t.id ? 'Primary' : '1st'}
                  </button>
                )}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="form-label">Production Status(es){aiBadge('statuses')}</label>
          <div className={`flex flex-wrap gap-2 mt-1 ${aiHighlights.has('statuses') ? 'ring-2 ring-purple-300 bg-purple-50/50 rounded-lg p-2' : ''}`}>
            {statusOptions.map(s => (
              <label key={s.id}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${
                  selectedStatusIds.includes(s.id) ? 'bg-accent/10 border-accent text-accent' : 'border-gray-300 text-gray-600 hover:border-gray-400'
                }`}
              >
                <input type="checkbox" className="sr-only" checked={selectedStatusIds.includes(s.id)}
                  onChange={() => toggleStatus(s.id)} />
                {s.name}
                {selectedStatusIds.includes(s.id) && selectedStatusIds.length > 1 && (
                  <button type="button" onClick={(e) => { e.preventDefault(); setPrimaryStatusId(s.id) }}
                    className={`ml-1 text-[10px] px-1 rounded ${primaryStatusId === s.id ? 'bg-accent text-white' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}
                    title="Set as primary"
                  >
                    {primaryStatusId === s.id ? 'Primary' : '1st'}
                  </button>
                )}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* ── Dates ── */}
      <div className="admin-card space-y-4">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          Dates
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="form-label">Production Start{aiBadge('production_date_start')}</label>
            <input name="production_date_start" type="date" defaultValue={v('production_date_start')?.slice?.(0, 10) ?? ''} className={`form-input ${aiRing('production_date_start')}`} />
          </div>
          <div>
            <label className="form-label">Production End{aiBadge('production_date_end')}</label>
            <input name="production_date_end" type="date" defaultValue={v('production_date_end')?.slice?.(0, 10) ?? ''} className={`form-input ${aiRing('production_date_end')}`} />
          </div>
          <div>
            <label className="form-label">Post-Production Start</label>
            <input name="production_date_startpost" type="date" defaultValue={v('production_date_startpost')?.slice?.(0, 10) ?? ''} className="form-input" />
          </div>
          <div>
            <label className="form-label">Post-Production End</label>
            <input name="production_date_endpost" type="date" defaultValue={v('production_date_endpost')?.slice?.(0, 10) ?? ''} className="form-input" />
          </div>
        </div>
      </div>

      {/* ── Locations ── */}
      <div className="admin-card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Locations
          </h2>
          <button type="button" onClick={addLocation} className="text-xs btn-outline py-1 px-2">+ Add Location</button>
        </div>
        {locations.map((loc, i) => (
          <div key={i} className={`grid grid-cols-2 md:grid-cols-5 gap-3 items-end ${aiRowBg(`location-${i}`)}`}>
            <div className="md:col-span-2">
              <label className="form-label text-xs">Location</label>
              <input value={loc.location} onChange={e => updateLocation(i, 'location', e.target.value)}
                className="form-input text-sm" placeholder="e.g. Los Angeles, CA" />
            </div>
            <div>
              <label className="form-label text-xs">City</label>
              <input value={loc.city} onChange={e => updateLocation(i, 'city', e.target.value)}
                className="form-input text-sm" placeholder="City" />
            </div>
            <div>
              <label className="form-label text-xs">State</label>
              <input value={loc.stage} onChange={e => updateLocation(i, 'stage', e.target.value)}
                className="form-input text-sm" placeholder="CA" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="form-label text-xs">Country</label>
                <input value={loc.country} onChange={e => updateLocation(i, 'country', e.target.value)}
                  className="form-input text-sm" placeholder="United States" />
              </div>
              {locations.length > 1 && (
                <button type="button" onClick={() => removeLocation(i)}
                  className="text-red-400 hover:text-red-600 self-end pb-2" title="Remove">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Companies ── */}
      <div className="admin-card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            Companies
          </h2>
          <button type="button" onClick={addCompany} className="text-xs btn-outline py-1 px-2">+ Add Company</button>
        </div>
        {companies.map((co, i) => {
          const matches = getCompanyMatchesFor(co.inline_name)
          const isLinked = co.company_id != null
          return (
            <DragHandleRow key={i} index={i} listId="prod-companies" onReorder={(from, to) => setCompanies(prev => reorderArray(prev, from, to))}>
            <div className={`border rounded-lg p-3 space-y-3 ${isLinked ? 'bg-green-50/50 border-green-200' : aiHighlights.has(`company-${i}`) ? 'bg-purple-50/50 border-purple-300 ring-1 ring-purple-300' : 'bg-gray-50/50'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase">Company {i + 1}</span>
                  {!isLinked && aiHighlights.has(`company-${i}`) && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-300">
                      AI Researched
                    </span>
                  )}
                  {isLinked && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 015.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
                      </svg>
                      Linked to #{co.company_id}
                      <button type="button" onClick={() => unlinkCompany(i)} className="ml-1 hover:text-red-600" title="Unlink">x</button>
                    </span>
                  )}
                </div>
                {companies.length > 1 && (
                  <button type="button" onClick={() => removeCompany(i)}
                    className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                )}
              </div>

              {/* Match suggestions */}
              {!isLinked && matches.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                  <p className="text-xs font-medium text-blue-700 mb-2 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Possible match{matches.length > 1 ? 'es' : ''} in database:
                  </p>
                  <div className="space-y-1.5">
                    {matches.map(m => (
                      <div key={m.id} className="flex items-center gap-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold ${scoreBadge(m.score)}`}>
                          {m.score}%
                        </span>
                        <span className="font-medium text-gray-800">{m.title}</span>
                        {m.detail && <span className="text-gray-400 truncate max-w-[200px]">{m.detail}</span>}
                        <button type="button" onClick={() => linkCompany(i, m)}
                          className="ml-auto px-2 py-0.5 text-[11px] font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
                          Link
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button"
                    onClick={() => setDismissedCompanyMatches(prev => new Set([...prev, co.inline_name]))}
                    className="mt-2 text-[10px] text-blue-500 hover:text-blue-700 underline">
                    No match — create as new
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="form-label text-xs">Name</label>
                  <EntitySearchInput
                    type="company"
                    value={co.inline_name}
                    onChange={val => updateCompany(i, 'inline_name', val)}
                    onSelect={result => linkCompany(i, { ...result, score: 100 })}
                    isLinked={isLinked}
                    placeholder="Company name — type to search"
                    className={`form-input text-sm ${isLinked ? 'bg-green-50' : ''}`}
                  />
                </div>
                <div>
                  <label className="form-label text-xs">Address</label>
                  <input value={co.inline_address ?? ''} onChange={e => updateCompany(i, 'inline_address', e.target.value)}
                    className="form-input text-sm" placeholder="Full address" />
                </div>
                <div>
                  <label className="form-label text-xs">Phone(s)</label>
                  <input value={(co.inline_phones ?? []).join(', ')}
                    onChange={e => updateCompany(i, 'inline_phones', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                    className="form-input text-sm" placeholder="Comma-separated" />
                </div>
                <div>
                  <label className="form-label text-xs">Email(s)</label>
                  <input value={(co.inline_emails ?? []).join(', ')}
                    onChange={e => updateCompany(i, 'inline_emails', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                    className="form-input text-sm" placeholder="Comma-separated" />
                </div>
              </div>

              {/* Social media toggle + action buttons */}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => toggleSocial(`company-${i}`)}
                  className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
                  <svg className={`w-3 h-3 transition-transform ${expandedSocial.has(`company-${i}`) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Social & Web
                </button>
                <div className="ml-auto flex items-center gap-2">
                  {creatingListing[`company-${i}-saved`] && (
                    <span className="text-[11px] text-green-600 font-medium flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      Saved
                    </span>
                  )}
                  {co.inline_name && (
                    <button type="button" onClick={() => researchCompany(i)}
                      disabled={researchingCompany[i]}
                      title="Use Claude AI to find publicly available contact info for this company"
                      className="text-[11px] text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1 disabled:opacity-60">
                      {researchingCompany[i] ? (
                        <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Researching...</>
                      ) : (
                        <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> Research with AI</>
                      )}
                    </button>
                  )}
                  {isLinked && co.inline_name && (
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
                  {!isLinked && co.inline_name && (
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 mt-1 border-t border-dashed border-gray-200">
                  <div>
                    <label className="form-label text-xs">LinkedIn</label>
                    <input value={co.inline_linkedin ?? ''} onChange={e => updateCompany(i, 'inline_linkedin', e.target.value)}
                      className="form-input text-sm" placeholder="https://linkedin.com/company/..." />
                  </div>
                  <div>
                    <label className="form-label text-xs">Twitter / X</label>
                    <input value={co.inline_twitter ?? ''} onChange={e => updateCompany(i, 'inline_twitter', e.target.value)}
                      className="form-input text-sm" placeholder="https://twitter.com/..." />
                  </div>
                  <div>
                    <label className="form-label text-xs">Instagram</label>
                    <input value={co.inline_instagram ?? ''} onChange={e => updateCompany(i, 'inline_instagram', e.target.value)}
                      className="form-input text-sm" placeholder="https://instagram.com/..." />
                  </div>
                  <div>
                    <label className="form-label text-xs">Website</label>
                    <input value={co.inline_website ?? ''} onChange={e => updateCompany(i, 'inline_website', e.target.value)}
                      className="form-input text-sm" placeholder="https://..." />
                  </div>
                </div>
              )}
            </div>
            </DragHandleRow>
          )
        })}
      </div>

      {/* ── Crew ── */}
      <div className="admin-card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Crew & Key Personnel
          </h2>
          <button type="button" onClick={addCrew} className="text-xs btn-outline py-1 px-2">+ Add Crew</button>
        </div>

        <div className="space-y-2">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-3 text-xs font-semibold text-gray-400 uppercase px-1">
            <div className="col-span-3">Role</div>
            <div className="col-span-3">Name</div>
            <div className="col-span-2">Phone</div>
            <div className="col-span-3">Email</div>
            <div className="col-span-1"></div>
          </div>
          {crew.map((c, i) => {
            const matches = getCrewMatchesFor(c.inline_name)
            const isLinked = c.crew_id != null
            return (
              <DragHandleRow key={i} index={i} listId="prod-crew" onReorder={(from, to) => setCrew(prev => reorderArray(prev, from, to))}>
                <div className="space-y-1">
                  <div className={`grid grid-cols-12 gap-3 items-center ${isLinked ? 'bg-green-50 rounded-lg px-1 py-1' : ''} ${!isLinked && aiHighlights.has(`crew-${i}`) ? 'bg-purple-50 ring-1 ring-purple-300 rounded-lg px-1 py-1' : ''}`}>
                    <div className="col-span-3">
                      <input value={c.role_name} onChange={e => updateCrew(i, 'role_name', e.target.value)}
                        className="form-input text-sm" placeholder="e.g. Director" />
                    </div>
                    <div className="col-span-3 relative">
                      <EntitySearchInput
                        type="crew"
                        value={c.inline_name}
                        onChange={val => updateCrew(i, 'inline_name', val)}
                        onSelect={result => linkCrew(i, { ...result, score: 100 })}
                        isLinked={isLinked}
                        placeholder="Full name — type to search"
                        className={`form-input text-sm ${isLinked ? 'bg-green-50 border-green-300 pr-16' : ''}`}
                      />
                      {isLinked && (
                        <span className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center gap-0.5 text-[9px] font-medium px-1 py-0.5 rounded bg-green-100 text-green-700 border border-green-300">
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                          </svg>
                          #{c.crew_id}
                          <button type="button" onClick={() => unlinkCrew(i)} className="hover:text-red-600">x</button>
                        </span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <input value={(c.inline_phones ?? []).join(', ')}
                        onChange={e => updateCrew(i, 'inline_phones', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        className="form-input text-sm" placeholder="Phone" />
                    </div>
                    <div className="col-span-3">
                      <input value={(c.inline_emails ?? []).join(', ')}
                        onChange={e => updateCrew(i, 'inline_emails', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        className="form-input text-sm" placeholder="Email" />
                    </div>
                    <div className="col-span-1 text-center">
                      {crew.length > 1 && (
                        <button type="button" onClick={() => removeCrew(i)}
                          className="text-red-400 hover:text-red-600" title="Remove">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Social / Action buttons row */}
                  <div className="flex items-center gap-2 ml-1 mt-0.5 mb-1 pb-1 border-b border-gray-100">
                    <button type="button" onClick={() => toggleSocial(`crew-${i}`)}
                      className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
                      <svg className={`w-3 h-3 transition-transform ${expandedSocial.has(`crew-${i}`) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Social & Web
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                      {creatingListing[`crew-${i}-saved`] && (
                        <span className="text-[11px] text-green-600 font-medium flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          Saved
                        </span>
                      )}
                      {isLinked && c.inline_name && (
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
                      {!isLinked && c.inline_name && (
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
                    <div className="ml-1 grid grid-cols-12 gap-3 pt-1 pb-2 mb-1 border-b border-dashed border-gray-200">
                      <div className="col-span-3">
                        <label className="form-label text-xs">LinkedIn</label>
                        <input value={c.inline_linkedin ?? ''} onChange={e => updateCrew(i, 'inline_linkedin', e.target.value)}
                          className="form-input text-sm" placeholder="linkedin.com/in/..." />
                      </div>
                      <div className="col-span-3">
                        <label className="form-label text-xs">Twitter / X</label>
                        <input value={c.inline_twitter ?? ''} onChange={e => updateCrew(i, 'inline_twitter', e.target.value)}
                          className="form-input text-sm" placeholder="twitter.com/..." />
                      </div>
                      <div className="col-span-3">
                        <label className="form-label text-xs">Instagram</label>
                        <input value={c.inline_instagram ?? ''} onChange={e => updateCrew(i, 'inline_instagram', e.target.value)}
                          className="form-input text-sm" placeholder="instagram.com/..." />
                      </div>
                      <div className="col-span-3">
                        <label className="form-label text-xs">Website</label>
                        <input value={c.inline_website ?? ''} onChange={e => updateCrew(i, 'inline_website', e.target.value)}
                          className="form-input text-sm" placeholder="https://..." />
                      </div>
                    </div>
                  )}

                  {/* Crew match suggestions */}
                  {!isLinked && matches.length > 0 && (
                    <div className="ml-3 bg-blue-50 border border-blue-200 rounded p-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-blue-600 font-medium flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Match:
                      </span>
                      {matches.slice(0, 3).map(m => (
                        <button key={m.id} type="button" onClick={() => linkCrew(i, m)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-300 bg-white hover:bg-green-50 hover:border-green-400 transition-colors">
                          <span className={`text-[9px] font-mono font-bold px-1 rounded ${scoreBadge(m.score)}`}>{m.score}%</span>
                          <span className="font-medium text-gray-800">{m.title}</span>
                          {m.detail && <span className="text-gray-400 hidden md:inline">{m.detail}</span>}
                        </button>
                      ))}
                      <button type="button"
                        onClick={() => setDismissedCrewMatches(prev => new Set([...prev, c.inline_name]))}
                        className="text-[10px] text-blue-400 hover:text-blue-600 ml-auto">
                        dismiss
                      </button>
                    </div>
                  )}
                </div>
              </DragHandleRow>
            )
          })}
        </div>
      </div>

      {/* ── Generate Blog Post ── */}
      <div className="admin-card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Blog Post</h3>
          {production?.blog_linked && (
            <Link href={`/admin/blog/${production.blog_linked}/edit`} className="text-xs text-[#3ea8c8] hover:underline">
              View linked post
            </Link>
          )}
        </div>
        <p className="text-xs text-gray-500">Generate an AI-written production report blog post based on this listing&apos;s data.</p>

        {blogResult?.saved ? (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-medium text-green-800">Blog draft created!</p>
            <p className="text-xs text-green-600 mt-1">{blogResult.title}</p>
            <Link href={`/admin/blog/${blogResult.blogPostId}/edit`}
              className="inline-block mt-2 text-xs text-[#3ea8c8] hover:underline font-medium">
              Edit blog post draft
            </Link>
          </div>
        ) : blogResult?.error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-800">Blog generation failed</p>
                <p className="text-sm text-red-600 mt-1">{blogResult.error}</p>
              </div>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          disabled={generatingBlog}
          onClick={async () => {
            setGeneratingBlog(true)
            setBlogResult(null)
            try {
              // Read current form values from the DOM
              const form = formRef.current
              const currentTitle = form ? (form.elements.namedItem('title') as HTMLInputElement)?.value : production?.title
              const currentExcerpt = form ? (form.elements.namedItem('excerpt') as HTMLTextAreaElement)?.value : production?.excerpt
              const currentContent = form ? (form.elements.namedItem('content') as HTMLTextAreaElement)?.value : production?.content
              const currentPhase = form ? (form.elements.namedItem('computed_status') as HTMLSelectElement)?.value : production?.computed_status
              const currentDateStart = form ? (form.elements.namedItem('production_date_start') as HTMLInputElement)?.value : production?.production_date_start
              const currentDateEnd = form ? (form.elements.namedItem('production_date_end') as HTMLInputElement)?.value : production?.production_date_end

              const res = await fetch('/api/admin/generate-blog-post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  productionId: production?.id,
                  productionData: {
                    title: currentTitle || '',
                    excerpt: currentExcerpt || '',
                    content: currentContent || '',
                    computed_status: currentPhase || '',
                    production_date_start: currentDateStart || '',
                    production_date_end: currentDateEnd || '',
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
              setBlogResult({
                saved: result.saved,
                blogPostId: result.blogPostId,
                blogSlug: result.blogSlug,
                title: result.blog?.title,
                error: result.saved ? undefined : result.error,
              })
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
      </div>

      {/* ── Save ── */}
      <div className="flex items-center gap-3 sticky bottom-0 bg-gray-100 py-4 -mx-6 px-6 border-t border-gray-200">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Saving…' : production ? 'Update Production' : 'Create Production'}
        </button>
        <Link href="/admin/productions" className="btn-outline">
          Cancel
        </Link>
        {production && (
          <Link href={`/production/${production.slug}`} target="_blank"
            className="ml-auto text-xs text-gray-500 hover:text-primary underline">
            View on site →
          </Link>
        )}
      </div>
    </form>
  )
}
