'use client'

import { useState } from 'react'

interface WeeklyReportPDFProps {
  weekMonday: string
  projectCount: number
  isMember?: boolean
}

/* ── helpers ──────────────────────────────────────────────── */

/** Parse PHP‑serialized arrays like  a:1:{i:0;s:55:"1640 S Sepulveda…"} */
function parsePhp(raw: string): string {
  if (!raw) return ''
  const matches: string[] = []
  const re = /s:\d+:"((?:[^"\\]|\\.)*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) matches.push(m[1])
  return matches.length ? matches.join(', ') : raw
}

/** Clean one field: unwrap PHP serialization, strip replacement chars */
function clean(val: string | null | undefined): string {
  if (!val) return ''
  let s = val.trim()
  if (s.startsWith('a:') && s.includes('{')) s = parsePhp(s)
  s = s.replace(/\uFFFD/g, ' ').replace(/\s{2,}/g, ' ').trim()
  return s
}

/** Format US phone to (310) 555-1234 */
function fmtPhone(phone: string): string {
  if (!phone) return ''
  const d = phone.replace(/[^\d+]/g, '')
  const us = d.match(/^(?:\+?1)?(\d{3})(\d{3})(\d{4})$/)
  if (us) return `(${us[1]}) ${us[2]}-${us[3]}`
  const local = d.match(/^(\d{3})(\d{4})$/)
  if (local) return `${local[1]}-${local[2]}`
  return phone.trim()
}

/** Extract first clean value from an array of possibly‑serialized strings */
function firstClean(arr: string[] | null | undefined): string {
  if (!arr?.length) return ''
  for (const v of arr) {
    const c = clean(v)
    if (c) return c
  }
  return ''
}

function allClean(arr: string[] | null | undefined): string[] {
  if (!arr?.length) return []
  const out: string[] = []
  for (const v of arr) {
    const c = clean(v)
    if (c) {
      // PHP serialized may have contained multiple values
      if (c.includes(', ')) {
        for (const part of c.split(', ')) {
          const trimmed = part.trim()
          if (trimmed) out.push(trimmed)
        }
      } else {
        out.push(c)
      }
    }
  }
  return out
}

export function WeeklyReportPDF({ weekMonday, projectCount, isMember = false }: WeeklyReportPDFProps) {
  const [loading, setLoading] = useState(false)

  // Non-members see upgrade prompt instead of download button
  if (!isMember) {
    return (
      <a
        href="/membership-plans"
        className="inline-flex items-center gap-2 bg-white/10 text-white/70 font-medium text-sm px-5 py-2.5 rounded-lg hover:bg-white/20 transition-colors whitespace-nowrap border border-white/20"
        title="Upgrade to download PDF reports"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        PDF Report
      </a>
    )
  }

  async function handleExport() {
    setLoading(true)
    try {
      const res = await fetch(`/api/weekly-report-data?date=${weekMonday}`)
      if (!res.ok) {
        if (res.status === 403) {
          alert('An active membership is required to download PDF reports.')
          return
        }
        throw new Error('Failed to load data')
      }
      const { productions, stats } = await res.json()

      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default

      const doc = new jsPDF('p', 'mm', 'letter') // US Letter
      const pw = doc.internal.pageSize.getWidth()  // 215.9
      const ph = doc.internal.pageSize.getHeight() // 279.4
      const ml = 12 // margin left
      const mr = 12
      const cw = pw - ml - mr // content width

      const monday = new Date(weekMonday + 'T00:00:00')
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      const fmt = (d: Date) =>
        d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      const dateRange = `${fmt(monday)} — ${fmt(sunday)}`

      // ── Brand colors ──
      const navy: [number, number, number] = [20, 30, 48]
      const accent: [number, number, number] = [56, 152, 190]
      const accentLight: [number, number, number] = [230, 245, 250]
      const cardBg: [number, number, number] = [248, 249, 251]
      const midGray: [number, number, number] = [120, 130, 145]
      const darkText: [number, number, number] = [25, 30, 40]
      const labelColor: [number, number, number] = [80, 90, 105]
      const divider: [number, number, number] = [215, 220, 228]
      const white: [number, number, number] = [255, 255, 255]

      let pageNum = 0

      function newPage() {
        if (pageNum > 0) doc.addPage()
        pageNum++
        return pageNum
      }

      function drawFooter() {
        doc.setDrawColor(...divider)
        doc.line(ml, ph - 12, pw - mr, ph - 12)
        doc.setFontSize(6.5)
        doc.setTextColor(...midGray)
        doc.setFont('helvetica', 'normal')
        doc.text('Production List — Film & Television Industry Alliance', ml, ph - 7.5)
        doc.text(dateRange, pw / 2, ph - 7.5, { align: 'center' })
        doc.text(`Page ${pageNum}`, pw - mr, ph - 7.5, { align: 'right' })
        doc.setFontSize(5.5)
        doc.text(
          'productionlist.ai  |  Confidential — For Members Only',
          pw / 2,
          ph - 4,
          { align: 'center' }
        )
      }

      // ═══════════════════════════════════════
      //  PAGE 1: COVER
      // ═══════════════════════════════════════
      newPage()

      // Full‑width navy header
      doc.setFillColor(...navy)
      doc.rect(0, 0, pw, 50, 'F')
      doc.setFillColor(...accent)
      doc.rect(0, 50, pw, 2, 'F')

      // Title block
      doc.setTextColor(...white)
      doc.setFontSize(24)
      doc.setFont('helvetica', 'bold')
      doc.text('Production List', ml, 20)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(180, 200, 220)
      doc.text('FILM & TELEVISION INDUSTRY ALLIANCE', ml, 28)
      doc.setFontSize(11)
      doc.setTextColor(...white)
      doc.setFont('helvetica', 'bold')
      doc.text('Weekly Pre-Production Report', ml, 40)

      // Right: date + count
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(200, 215, 230)
      doc.text(dateRange, pw - mr, 20, { align: 'right' })
      doc.setFontSize(36)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...white)
      doc.text(String(projectCount), pw - mr, 38, { align: 'right' })
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(180, 200, 220)
      doc.text('PROJECTS THIS WEEK', pw - mr, 45, { align: 'right' })

      let y = 60

      // ── Stats dashboard: 4 cards ──
      if (stats) {
        const gap = 4
        const boxW = (cw - gap * 3) / 4
        const boxH = 26
        const statsData = [
          {
            label: 'PROJECTS',
            value: String(stats.currentCount),
            sub: '',
            color: navy,
          },
          {
            label: 'VS LAST WEEK',
            value: `${stats.delta >= 0 ? '+' : ''}${stats.delta}`,
            sub: `${stats.previousCount} prev`,
            color: stats.delta >= 0 ? ([22, 140, 70] as [number, number, number]) : ([200, 40, 40] as [number, number, number]),
          },
          {
            label: 'COMPANIES',
            value: String(stats.totalCompanies),
            sub: '',
            color: navy,
          },
          {
            label: 'CONTACTS',
            value: String(stats.totalCrew),
            sub: '',
            color: navy,
          },
        ]

        statsData.forEach((s, i) => {
          const x = ml + i * (boxW + gap)
          doc.setFillColor(...cardBg)
          doc.roundedRect(x, y, boxW, boxH, 2, 2, 'F')
          // top accent line
          doc.setFillColor(...(s.color as [number, number, number]))
          doc.rect(x, y, boxW, 1.5, 'F')

          doc.setFontSize(20)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(...(s.color as [number, number, number]))
          doc.text(s.value, x + boxW / 2, y + 13, { align: 'center' })
          doc.setFontSize(6)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(...midGray)
          doc.text(s.label, x + boxW / 2, y + 19, { align: 'center' })
          if (s.sub) {
            doc.setFontSize(5.5)
            doc.setFont('helvetica', 'normal')
            doc.text(s.sub, x + boxW / 2, y + 23, { align: 'center' })
          }
        })

        y += boxH + 10

        // ── Phase breakdown bar ──
        const phases = Object.entries(stats.phases || {})
        if (phases.length > 0 && stats.currentCount > 0) {
          doc.setFontSize(8)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(...darkText)
          doc.text('PRODUCTION PHASE', ml, y)
          y += 4

          const barH = 6
          const phaseColors: Record<string, [number, number, number]> = {
            'in-pre-production': [37, 99, 235],
            'in-production': [22, 163, 74],
            'in-post-production': [147, 51, 234],
            completed: [156, 163, 175],
          }
          const phaseNames: Record<string, string> = {
            'in-pre-production': 'Pre-Production',
            'in-production': 'In Production',
            'in-post-production': 'Post-Production',
            completed: 'Completed',
          }

          let bx = ml
          for (const [phase, count] of phases) {
            const pct = (count as number) / stats.currentCount
            const w = cw * pct
            doc.setFillColor(...(phaseColors[phase] ?? [156, 163, 175]))
            if (bx === ml) {
              doc.roundedRect(bx, y, w, barH, 1, 1, 'F')
            } else {
              doc.rect(bx, y, w, barH, 'F')
            }
            bx += w
          }
          y += barH + 4

          // Legend row
          let lx = ml
          for (const [phase, count] of phases) {
            const color = phaseColors[phase] ?? [156, 163, 175]
            const name = phaseNames[phase] ?? phase
            doc.setFillColor(...color)
            doc.circle(lx + 1.5, y + 0.5, 1.5, 'F')
            doc.setFontSize(6.5)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(...darkText)
            const label = `${name} (${count})`
            doc.text(label, lx + 5, y + 1.5)
            lx += doc.getTextWidth(label) + 12
          }
          y += 10
        }

        // ── Type & Location side-by-side tables ──
        const colW2 = (cw - 8) / 2

        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...darkText)
        doc.text('TYPE DISTRIBUTION', ml, y)
        doc.text('TOP FILMING LOCATIONS', ml + colW2 + 8, y)
        y += 2

        if (stats.topTypes?.length > 0) {
          autoTable(doc, {
            startY: y,
            head: [['Type', '#']],
            body: stats.topTypes.map(([t, c]: [string, number]) => [t, String(c)]),
            theme: 'plain',
            headStyles: {
              fillColor: [...cardBg] as any,
              textColor: [...midGray] as any,
              fontSize: 6,
              fontStyle: 'bold',
            },
            bodyStyles: { fontSize: 7, textColor: [...darkText] as any, cellPadding: 1.5 },
            columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' as const, cellWidth: 12 } },
            margin: { left: ml, right: pw - ml - colW2 },
            tableWidth: colW2,
          })
        }

        if (stats.topLocations?.length > 0) {
          autoTable(doc, {
            startY: y,
            head: [['Location', '#']],
            body: stats.topLocations.map(([l, c]: [string, number]) => [l, String(c)]),
            theme: 'plain',
            headStyles: {
              fillColor: [...cardBg] as any,
              textColor: [...midGray] as any,
              fontSize: 6,
              fontStyle: 'bold',
            },
            bodyStyles: { fontSize: 7, textColor: [...darkText] as any, cellPadding: 1.5 },
            columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' as const, cellWidth: 12 } },
            margin: { left: ml + colW2 + 8, right: mr },
            tableWidth: colW2,
          })
        }
      }

      drawFooter()

      // ═══════════════════════════════════════
      //  PAGES 2+: PRODUCTION DETAIL SHEETS
      // ═══════════════════════════════════════
      function drawPageHeader() {
        doc.setFillColor(...navy)
        doc.rect(0, 0, pw, 13, 'F')
        doc.setFillColor(...accent)
        doc.rect(0, 13, pw, 1, 'F')
        doc.setTextColor(...white)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.text('Production List — Weekly Pre-Production Report', ml, 8.5)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.text(dateRange, pw - mr, 8.5, { align: 'right' })
      }

      const bottomMargin = 18

      function ensureSpace(needed: number): number {
        if (y + needed > ph - bottomMargin) {
          drawFooter()
          newPage()
          drawPageHeader()
          return 20
        }
        return y
      }

      // ── Helper: format date from raw ──
      function fmtDate(raw: string | null): string {
        if (!raw) return 'TBA'
        if (/^\d{8}$/.test(raw)) {
          const yr = raw.slice(0, 4)
          const mo = parseInt(raw.slice(4, 6), 10) - 1
          const da = parseInt(raw.slice(6, 8), 10)
          return new Date(parseInt(yr), mo, da).toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric',
          })
        }
        const d = new Date(raw)
        return isNaN(d.getTime()) ? 'TBA' : d.toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric',
        })
      }

      // Start page 2
      newPage()
      drawPageHeader()
      y = 20

      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...darkText)
      doc.text('Production Details', ml, y)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...midGray)
      doc.text(`${productions.length} productions for the week of ${fmt(monday)}`, ml, y + 5)
      y += 12

      for (let i = 0; i < productions.length; i++) {
        const p = productions[i]

        // ── Extract data ──
        const type =
          p.production_type_links?.find((l: any) => l.is_primary)?.production_types?.name ??
          p.production_type_links?.[0]?.production_types?.name ?? ''
        const statusRaw = p.computed_status ?? 'in-pre-production'
        const statusLabel = statusRaw
          .replace(/-/g, ' ')
          .replace(/^in /, 'In ')
          .replace(/\b\w/g, (c: string) => c.toUpperCase())
        const phaseColor: [number, number, number] =
          statusRaw === 'in-production' ? [22, 163, 74]
          : statusRaw === 'in-post-production' ? [147, 51, 234]
          : statusRaw === 'completed' ? [156, 163, 175]
          : [37, 99, 235]

        const locs = (p.production_locations ?? [])
          .map((l: any) => [l.city, l.location, l.country].filter(Boolean).join(', '))
          .filter(Boolean)

        const startDate = fmtDate(p.production_date_start)
        const endDate = p.production_date_end ? fmtDate(p.production_date_end) : ''

        const description = (p.excerpt || p.content || '')
          .replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ')
          .replace(/\uFFFD/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300)

        // Companies with full contact info
        const companies = (p.production_company_links ?? []).map((link: any) => {
          const co = link.companies
          return {
            name: co?.title || clean(link.inline_name) || 'Unknown',
            address: (co ? firstClean(co.addresses) : '') || clean(link.inline_address) || '',
            phones: (co ? allClean(co.phones) : allClean(link.inline_phones)).map(fmtPhone),
            faxes: (co ? allClean(co.faxes) : allClean(link.inline_faxes)).map(fmtPhone),
            emails: co ? allClean(co.emails) : allClean(link.inline_emails),
          }
        })

        // Crew with roles and contact info
        const crew = (p.production_crew_roles ?? []).map((link: any) => {
          const cm = link.crew_members
          return {
            name: cm?.name || clean(link.inline_name) || '',
            role: link.role_name || '',
            phones: (cm ? allClean(cm.phones) : allClean(link.inline_phones)).map(fmtPhone),
            emails: cm ? allClean(cm.emails) : allClean(link.inline_emails),
          }
        }).filter((c: any) => c.name)

        // ── Ensure space for at least the header block ──
        y = ensureSpace(30)

        // ═══ PRODUCTION TITLE BAR ═══
        // Navy background for title row
        doc.setFillColor(...navy)
        doc.roundedRect(ml, y, cw, 8, 1.5, 1.5, 'F')

        // Number
        doc.setFontSize(7)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...accent)
        doc.text(String(i + 1).padStart(2, '0'), ml + 3, y + 5.5)

        // Title
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...white)
        const titleText = p.title.length > 65 ? p.title.substring(0, 62) + '...' : p.title
        doc.text(titleText, ml + 12, y + 5.5)

        // Type badge on right
        if (type) {
          doc.setFontSize(6)
          doc.setFont('helvetica', 'bold')
          const tw = doc.getTextWidth(type) + 6
          doc.setFillColor(219, 234, 254)
          doc.roundedRect(pw - mr - tw - 1, y + 1.5, tw, 5, 1, 1, 'F')
          doc.setTextColor(29, 78, 216)
          doc.text(type, pw - mr - tw + 2, y + 5)
        }

        y += 10

        // ═══ INFO ROW: Location | Dates | Status ═══
        doc.setFillColor(...cardBg)
        doc.rect(ml, y, cw, 7, 'F')

        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...darkText)

        let infoX = ml + 3
        // Location
        if (locs.length > 0) {
          doc.setFont('helvetica', 'bold')
          doc.text('Location:', infoX, y + 4.5)
          infoX += doc.getTextWidth('Location:') + 2
          doc.setFont('helvetica', 'normal')
          const locText = locs.slice(0, 2).join('; ')
          doc.text(locText, infoX, y + 4.5)
          infoX += doc.getTextWidth(locText) + 6
        }

        // Start date
        doc.setFont('helvetica', 'bold')
        doc.text('Start:', infoX, y + 4.5)
        infoX += doc.getTextWidth('Start:') + 2
        doc.setFont('helvetica', 'normal')
        doc.text(startDate, infoX, y + 4.5)
        infoX += doc.getTextWidth(startDate) + 6

        // End date
        if (endDate) {
          doc.setFont('helvetica', 'bold')
          doc.text('End:', infoX, y + 4.5)
          infoX += doc.getTextWidth('End:') + 2
          doc.setFont('helvetica', 'normal')
          doc.text(endDate, infoX, y + 4.5)
          infoX += doc.getTextWidth(endDate) + 6
        }

        // Status
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...phaseColor)
        doc.text(statusLabel, pw - mr - 3, y + 4.5, { align: 'right' })

        y += 9

        // ═══ DESCRIPTION ═══
        if (description) {
          doc.setFontSize(7)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(60, 70, 85)
          const descText = description + (description.length >= 300 ? '...' : '')
          const lines = doc.splitTextToSize(descText, cw - 8)
          for (const line of lines) {
            y = ensureSpace(4)
            doc.text(line, ml + 3, y)
            y += 3.2
          }
          y += 2
        }

        // ═══ PRODUCTION COMPANIES TABLE ═══
        if (companies.length > 0) {
          y = ensureSpace(8)

          // Section header
          doc.setFillColor(...accent)
          doc.rect(ml, y, cw, 0.5, 'F')
          y += 2.5
          doc.setFontSize(7)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(...accent)
          doc.text('PRODUCTION COMPANIES', ml + 2, y)
          y += 2

          // Company table rows
          const companyRows = companies.map((co: any) => {
            const contactParts: string[] = []
            if (co.phones.length > 0) contactParts.push(`Ph: ${co.phones.join(', ')}`)
            if (co.faxes.length > 0) contactParts.push(`Fax: ${co.faxes.join(', ')}`)
            return [
              co.name,
              co.address || '—',
              contactParts.join('\n') || '—',
              co.emails.join('\n') || '—',
            ]
          })

          autoTable(doc, {
            startY: y,
            head: [['Company', 'Address', 'Phone / Fax', 'Email']],
            body: companyRows,
            theme: 'grid',
            headStyles: {
              fillColor: [...navy] as any,
              textColor: [...white] as any,
              fontSize: 6,
              fontStyle: 'bold',
              cellPadding: 1.5,
            },
            bodyStyles: {
              fontSize: 6.5,
              textColor: [...darkText] as any,
              cellPadding: 1.5,
              lineColor: [...divider] as any,
              lineWidth: 0.2,
            },
            alternateRowStyles: {
              fillColor: [...cardBg] as any,
            },
            columnStyles: {
              0: { fontStyle: 'bold', cellWidth: 38 },
              1: { cellWidth: 55 },
              2: { cellWidth: 38 },
              3: { },
            },
            margin: { left: ml, right: mr },
            tableWidth: cw,
            didDrawPage: () => {
              drawPageHeader()
            },
          })

          y = (doc as any).lastAutoTable?.finalY ?? y + companyRows.length * 6
          y += 3
        }

        // ═══ KEY PEOPLE TABLE ═══
        if (crew.length > 0) {
          y = ensureSpace(8)

          // Section header
          doc.setFillColor(...accent)
          doc.rect(ml, y, cw, 0.5, 'F')
          y += 2.5
          doc.setFontSize(7)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(...accent)
          doc.text('KEY PEOPLE', ml + 2, y)
          y += 2

          // Crew table rows
          const crewRows = crew.map((c: any) => {
            const phone = c.phones.length > 0 ? c.phones[0] : '—'
            const email = c.emails.length > 0 ? c.emails[0] : '—'
            return [c.role || '—', c.name, phone, email]
          })

          autoTable(doc, {
            startY: y,
            head: [['Role', 'Name', 'Phone', 'Email']],
            body: crewRows,
            theme: 'grid',
            headStyles: {
              fillColor: [...navy] as any,
              textColor: [...white] as any,
              fontSize: 6,
              fontStyle: 'bold',
              cellPadding: 1.5,
            },
            bodyStyles: {
              fontSize: 6.5,
              textColor: [...darkText] as any,
              cellPadding: 1.5,
              lineColor: [...divider] as any,
              lineWidth: 0.2,
            },
            alternateRowStyles: {
              fillColor: [...cardBg] as any,
            },
            columnStyles: {
              0: { fontStyle: 'bold', cellWidth: 35 },
              1: { cellWidth: 40 },
              2: { cellWidth: 35 },
              3: { },
            },
            margin: { left: ml, right: mr },
            tableWidth: cw,
            didDrawPage: () => {
              drawPageHeader()
            },
          })

          y = (doc as any).lastAutoTable?.finalY ?? y + crewRows.length * 5
          y += 3
        }

        // ── Separator between productions ──
        y += 3
        if (i < productions.length - 1) {
          y = ensureSpace(6)
          doc.setDrawColor(...navy)
          doc.setLineWidth(0.5)
          doc.line(ml, y, pw - mr, y)
          y += 6
        }
      }

      drawFooter()

      // ═══════════════════════════════════════
      //  FINAL PAGE: Summary / Index
      // ═══════════════════════════════════════
      newPage()
      drawPageHeader()
      y = 22

      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...darkText)
      doc.text('Production Index', ml, y)
      y += 2

      // Build a compact index table
      const indexRows = productions.map((p: any, i: number) => {
        const type =
          p.production_type_links?.find((l: any) => l.is_primary)?.production_types?.name ??
          p.production_type_links?.[0]?.production_types?.name ??
          ''
        const loc = (p.production_locations ?? [])
          .map((l: any) => l.city || l.location || '')
          .filter(Boolean)[0] ?? ''
        const companies = (p.production_company_links ?? [])
          .map((c: any) => c.companies?.title || clean(c.inline_name) || '')
          .filter(Boolean)
          .slice(0, 2)
          .join(', ')
        return [String(i + 1), p.title, type, loc, companies]
      })

      autoTable(doc, {
        startY: y,
        head: [['#', 'Production', 'Type', 'Location', 'Company']],
        body: indexRows,
        theme: 'striped',
        headStyles: {
          fillColor: [...navy] as any,
          textColor: [...white] as any,
          fontSize: 6.5,
          fontStyle: 'bold',
          cellPadding: 2,
        },
        bodyStyles: {
          fontSize: 6.5,
          textColor: [...darkText] as any,
          cellPadding: 1.5,
        },
        alternateRowStyles: {
          fillColor: [...cardBg] as any,
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' as const, fontStyle: 'bold' },
          1: { cellWidth: 55, fontStyle: 'bold' },
          2: { cellWidth: 28 },
          3: { cellWidth: 30 },
          4: {},
        },
        margin: { left: ml, right: mr },
        tableWidth: cw,
        didDrawPage: () => {
          drawPageHeader()
          drawFooter()
        },
      })

      drawFooter()

      doc.save(`production-list-${weekMonday}.pdf`)
    } catch (err) {
      console.error('PDF export error:', err)
      alert('Failed to generate PDF. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="inline-flex items-center gap-2 text-sm font-medium bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"
    >
      {loading ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Generating PDF…
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Export PDF Report
        </>
      )}
    </button>
  )
}
