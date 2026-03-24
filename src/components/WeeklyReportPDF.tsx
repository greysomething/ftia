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
      // Fetch production data for this week
      const res = await fetch(`/api/weekly-report-data?date=${weekMonday}`)
      if (!res.ok) throw new Error('Failed to load data')
      const { productions, stats } = await res.json()

      // Dynamic import to keep bundle small
      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default

      const doc = new jsPDF('p', 'mm', 'a4')
      const pageWidth = doc.internal.pageSize.getWidth()

      // ── Header ──
      doc.setFillColor(26, 35, 50) // #1a2332
      doc.rect(0, 0, pageWidth, 32, 'F')

      doc.setTextColor(255, 255, 255)
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('Production List', 14, 15)

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text('FILM & TELEVISION INDUSTRY ALLIANCE', 14, 22)

      // Date range
      const monday = new Date(weekMonday + 'T00:00:00')
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      const dateRange = `Week of ${fmt(monday)} — ${fmt(sunday)}`

      doc.setFontSize(10)
      doc.text(dateRange, pageWidth - 14, 15, { align: 'right' })
      doc.text(`${projectCount} Projects`, pageWidth - 14, 22, { align: 'right' })

      // ── Stats Summary ──
      let y = 40
      doc.setTextColor(26, 35, 50)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Weekly Summary', 14, y)
      y += 8

      if (stats) {
        const summaryData = [
          ['Total Projects', String(stats.currentCount)],
          ['Week-over-Week', `${stats.delta >= 0 ? '+' : ''}${stats.delta}`],
          ['Companies Listed', String(stats.totalCompanies)],
          ['Crew Contacts', String(stats.totalCrew)],
          ['Filming Locations', String(stats.totalLocations)],
        ]

        autoTable(doc, {
          startY: y,
          head: [['Metric', 'Value']],
          body: summaryData,
          theme: 'grid',
          headStyles: { fillColor: [26, 58, 92], fontSize: 9 },
          bodyStyles: { fontSize: 9 },
          columnStyles: { 0: { fontStyle: 'bold' } },
          margin: { left: 14, right: 14 },
          tableWidth: 80,
        })

        y = (doc as any).lastAutoTable.finalY + 10
      }

      // ── Productions Table ──
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Productions', 14, y)
      y += 4

      const tableBody = productions.map((p: any) => {
        const type = p.production_type_links?.[0]?.production_types?.name ?? '—'
        const status = p.computed_status?.replace(/-/g, ' ')?.replace(/^in /, 'In ') ?? '—'
        const location = p.production_locations?.[0]?.city || p.production_locations?.[0]?.location || '—'
        const date = p.production_date_start
          ? new Date(p.production_date_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          : '—'
        return [p.title, type, status, location, date]
      })

      autoTable(doc, {
        startY: y,
        head: [['Title', 'Type', 'Status', 'Location', 'Start Date']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [26, 58, 92], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: {
          0: { cellWidth: 55, fontStyle: 'bold' },
          1: { cellWidth: 30 },
          2: { cellWidth: 30 },
          3: { cellWidth: 35 },
          4: { cellWidth: 25 },
        },
        margin: { left: 14, right: 14 },
        didDrawPage: (data: any) => {
          // Footer on each page
          doc.setFontSize(7)
          doc.setTextColor(150, 150, 150)
          doc.text(
            `Production List — ${dateRange} — Page ${data.pageNumber}`,
            pageWidth / 2, doc.internal.pageSize.getHeight() - 8,
            { align: 'center' }
          )
          doc.text(
            'productionlist.ai',
            pageWidth - 14, doc.internal.pageSize.getHeight() - 8,
            { align: 'right' }
          )
        },
      })

      // Save
      const filename = `production-list-${weekMonday}.pdf`
      doc.save(filename)
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
          Export PDF
        </>
      )}
    </button>
  )
}
