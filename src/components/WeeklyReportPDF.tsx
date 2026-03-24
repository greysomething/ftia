'use client'

import { useState } from 'react'

interface WeeklyReportPDFProps {
  weekMonday: string
  projectCount: number
}

export function WeeklyReportPDF({ weekMonday, projectCount }: WeeklyReportPDFProps) {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    setLoading(true)
    try {
      const res = await fetch(`/api/weekly-report-data?date=${weekMonday}`)
      if (!res.ok) throw new Error('Failed to load data')
      const { productions, stats } = await res.json()

      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default

      const doc = new jsPDF('p', 'mm', 'a4')
      const pw = doc.internal.pageSize.getWidth()
      const ph = doc.internal.pageSize.getHeight()
      const margin = 14

      const monday = new Date(weekMonday + 'T00:00:00')
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const dateRange = `${fmt(monday)} — ${fmt(sunday)}`

      // Colors
      const navy = [26, 35, 50] as const
      const accent = [62, 168, 200] as const
      const lightGray = [245, 247, 250] as const
      const midGray = [156, 163, 175] as const
      const darkText = [31, 41, 55] as const

      function drawFooter(pageNum: number) {
        doc.setDrawColor(220, 220, 220)
        doc.line(margin, ph - 14, pw - margin, ph - 14)
        doc.setFontSize(7)
        doc.setTextColor(...midGray)
        doc.setFont('helvetica', 'normal')
        doc.text('Production List — Film & Television Industry Alliance', margin, ph - 9)
        doc.text(`${dateRange}`, pw / 2, ph - 9, { align: 'center' })
        doc.text(`Page ${pageNum}`, pw - margin, ph - 9, { align: 'right' })
        doc.setFontSize(6)
        doc.text('productionlist.ai | Confidential — For Members Only', pw / 2, ph - 5, { align: 'center' })
      }

      function drawHeader() {
        // Dark navy header bar
        doc.setFillColor(...navy)
        doc.rect(0, 0, pw, 36, 'F')
        // Accent stripe
        doc.setFillColor(...accent)
        doc.rect(0, 36, pw, 2, 'F')

        doc.setTextColor(255, 255, 255)
        doc.setFontSize(20)
        doc.setFont('helvetica', 'bold')
        doc.text('Production List', margin, 16)

        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(255, 255, 255, 0.6)
        doc.text('FILM & TELEVISION INDUSTRY ALLIANCE', margin, 23)

        doc.setFontSize(8)
        doc.setTextColor(255, 255, 255)
        doc.text('WEEKLY PRE-PRODUCTION REPORT', margin, 31)

        // Right side: date + count
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text(dateRange, pw - margin, 16, { align: 'right' })
        doc.setFontSize(22)
        doc.text(String(projectCount), pw - margin, 29, { align: 'right' })
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.text('PROJECTS', pw - margin, 34, { align: 'right' })
      }

      // ═══════════════════════════════════════════════
      // PAGE 1: Cover + Stats
      // ═══════════════════════════════════════════════
      drawHeader()
      let y = 46

      // Stats dashboard — 4 boxes in a row
      if (stats) {
        const boxW = (pw - margin * 2 - 9) / 4
        const boxH = 22
        const statsData = [
          { label: 'PROJECTS', value: String(stats.currentCount), color: navy },
          { label: 'VS LAST WEEK', value: `${stats.delta >= 0 ? '+' : ''}${stats.delta}`, color: stats.delta >= 0 ? [22, 163, 74] : [220, 38, 38] },
          { label: 'COMPANIES', value: String(stats.totalCompanies), color: navy },
          { label: 'CREW CONTACTS', value: String(stats.totalCrew), color: navy },
        ]

        statsData.forEach((s, i) => {
          const x = margin + i * (boxW + 3)
          doc.setFillColor(...lightGray)
          doc.roundedRect(x, y, boxW, boxH, 2, 2, 'F')
          doc.setFontSize(18)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(...(s.color as [number, number, number]))
          doc.text(s.value, x + boxW / 2, y + 11, { align: 'center' })
          doc.setFontSize(6)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(...midGray)
          doc.text(s.label, x + boxW / 2, y + 18, { align: 'center' })
        })

        y += boxH + 8

        // Phase breakdown bar
        const phases = Object.entries(stats.phases || {})
        if (phases.length > 0 && stats.currentCount > 0) {
          doc.setFontSize(8)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(...darkText)
          doc.text('Production Phase Breakdown', margin, y)
          y += 4

          const barH = 5
          const barW = pw - margin * 2
          const phaseColors: Record<string, [number, number, number]> = {
            'in-pre-production': [37, 99, 235],
            'in-production': [22, 163, 74],
            'in-post-production': [147, 51, 234],
            'completed': [156, 163, 175],
          }
          const phaseNames: Record<string, string> = {
            'in-pre-production': 'Pre-Production',
            'in-production': 'In Production',
            'in-post-production': 'Post-Production',
            'completed': 'Completed',
          }

          let bx = margin
          for (const [phase, count] of phases) {
            const pct = (count as number) / stats.currentCount
            const w = barW * pct
            const color = phaseColors[phase] ?? [156, 163, 175]
            doc.setFillColor(...color)
            doc.rect(bx, y, w, barH, 'F')
            bx += w
          }
          y += barH + 3

          // Legend
          let lx = margin
          for (const [phase, count] of phases) {
            const color = phaseColors[phase] ?? [156, 163, 175]
            const name = phaseNames[phase] ?? phase
            doc.setFillColor(...color)
            doc.circle(lx + 1.5, y + 1, 1.5, 'F')
            doc.setFontSize(6.5)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(...darkText)
            const label = `${name} (${count})`
            doc.text(label, lx + 5, y + 2)
            lx += doc.getTextWidth(label) + 10
          }
          y += 8
        }

        // Type & Location breakdown side by side
        const colW = (pw - margin * 2 - 6) / 2

        // Type distribution
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...darkText)
        doc.text('Type Distribution', margin, y)

        doc.text('Top Filming Locations', margin + colW + 6, y)
        y += 2

        if (stats.topTypes?.length > 0) {
          autoTable(doc, {
            startY: y,
            head: [['Type', 'Count']],
            body: stats.topTypes.map(([t, c]: [string, number]) => [t, String(c)]),
            theme: 'plain',
            headStyles: { fillColor: [...lightGray] as any, textColor: [...midGray] as any, fontSize: 6.5, fontStyle: 'bold' },
            bodyStyles: { fontSize: 7, textColor: [...darkText] as any },
            columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' as const, cellWidth: 15 } },
            margin: { left: margin, right: pw - margin - colW },
            tableWidth: colW,
          })
        }

        if (stats.topLocations?.length > 0) {
          autoTable(doc, {
            startY: y,
            head: [['Location', 'Count']],
            body: stats.topLocations.map(([l, c]: [string, number]) => [l, String(c)]),
            theme: 'plain',
            headStyles: { fillColor: [...lightGray] as any, textColor: [...midGray] as any, fontSize: 6.5, fontStyle: 'bold' },
            bodyStyles: { fontSize: 7, textColor: [...darkText] as any },
            columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' as const, cellWidth: 15 } },
            margin: { left: margin + colW + 6, right: margin },
            tableWidth: colW,
          })
        }
      }

      drawFooter(1)

      // ═══════════════════════════════════════════════
      // PAGE 2+: Detailed Production Listings
      // ═══════════════════════════════════════════════
      let pageNum = 2
      doc.addPage()

      // Mini header on continuation pages
      function drawMiniHeader() {
        doc.setFillColor(...navy)
        doc.rect(0, 0, pw, 14, 'F')
        doc.setFillColor(...accent)
        doc.rect(0, 14, pw, 1, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.text('Production List — Weekly Report', margin, 9)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.text(dateRange, pw - margin, 9, { align: 'right' })
      }

      drawMiniHeader()
      y = 22

      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...darkText)
      doc.text('Production Details', margin, y)
      y += 6

      // Render each production as a detailed card
      for (let i = 0; i < productions.length; i++) {
        const p = productions[i]
        const type = p.production_type_links?.[0]?.production_types?.name ?? ''
        const statusRaw = p.computed_status ?? 'in-pre-production'
        const status = statusRaw.replace(/-/g, ' ').replace(/^in /, 'In ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        const locs = (p.production_locations ?? []).map((l: any) => [l.city, l.location, l.country].filter(Boolean).join(', ')).filter(Boolean)
        const companies = (p.production_company_links ?? []).map((c: any) => c.companies?.title || c.inline_name).filter(Boolean)
        const crew = (p.production_crew_roles ?? []).map((c: any) => {
          const name = c.crew_members?.name || c.inline_name || ''
          const role = c.role_name || ''
          return name && role ? `${name} (${role})` : name || role
        }).filter(Boolean)
        const startDate = p.production_date_start
          ? new Date(p.production_date_start).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : 'TBA'
        const description = (p.excerpt || p.content || '').replace(/<[^>]*>/g, '').trim().substring(0, 200)

        // Estimate card height
        const descLines = description ? Math.ceil(description.length / 85) : 0
        const companyLines = Math.ceil(companies.length / 3)
        const crewLines = Math.ceil(crew.length / 2)
        const cardH = 18 + (descLines * 3.5) + (companies.length > 0 ? 8 + companyLines * 3.5 : 0) + (crew.length > 0 ? 8 + crewLines * 3.5 : 0)

        // Check if we need a new page
        if (y + cardH > ph - 20) {
          drawFooter(pageNum)
          pageNum++
          doc.addPage()
          drawMiniHeader()
          y = 22
        }

        // Card background
        doc.setFillColor(...lightGray)
        doc.roundedRect(margin, y, pw - margin * 2, Math.min(cardH, ph - y - 20), 2, 2, 'F')

        // Left accent stripe based on phase
        const phaseColor = statusRaw === 'in-production' ? [22, 163, 74] :
          statusRaw === 'in-post-production' ? [147, 51, 234] :
          statusRaw === 'completed' ? [156, 163, 175] : [37, 99, 235]
        doc.setFillColor(...(phaseColor as [number, number, number]))
        doc.rect(margin, y, 2, Math.min(cardH, ph - y - 20), 'F')

        // Title row
        const tx = margin + 5
        y += 5
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...darkText)
        doc.text(p.title, tx, y)

        // Type + Status badges (right side)
        const badgeY = y - 3
        let bx2 = pw - margin - 3
        if (type) {
          const tw = doc.getTextWidth(type) + 4
          bx2 -= tw
          doc.setFillColor(219, 234, 254) // blue-100
          doc.roundedRect(bx2, badgeY, tw, 5, 1, 1, 'F')
          doc.setFontSize(5.5)
          doc.setTextColor(29, 78, 216)
          doc.text(type, bx2 + 2, badgeY + 3.5)
        }

        y += 4
        // Location + Date
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...midGray)
        const metaLine = [
          locs.length > 0 ? `📍 ${locs[0]}` : null,
          `📅 Start: ${startDate}`,
          status,
        ].filter(Boolean).join('  |  ')
        doc.text(metaLine, tx, y)

        // Description
        if (description) {
          y += 5
          doc.setFontSize(7)
          doc.setTextColor(75, 85, 99)
          const lines = doc.splitTextToSize(description + (description.length >= 200 ? '…' : ''), pw - margin * 2 - 10)
          doc.text(lines, tx, y)
          y += lines.length * 3.2
        }

        // Companies
        if (companies.length > 0) {
          y += 3
          doc.setFontSize(6)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(...accent)
          doc.text('PRODUCTION COMPANIES', tx, y)
          y += 3
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6.5)
          doc.setTextColor(...darkText)
          const compText = companies.slice(0, 6).join('  •  ')
          doc.text(compText, tx, y)
          y += 3
        }

        // Key crew
        if (crew.length > 0) {
          y += 1
          doc.setFontSize(6)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(...accent)
          doc.text('KEY CREW', tx, y)
          y += 3
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6.5)
          doc.setTextColor(...darkText)
          const crewText = crew.slice(0, 8).join('  •  ')
          const crewLines2 = doc.splitTextToSize(crewText, pw - margin * 2 - 10)
          doc.text(crewLines2, tx, y)
          y += crewLines2.length * 3
        }

        y += 5 // spacing between cards
      }

      drawFooter(pageNum)

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
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Generating…
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export PDF Report
        </>
      )}
    </button>
  )
}
