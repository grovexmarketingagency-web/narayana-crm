import { buildXlsx } from './xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { DB } from './types'
import { inFrame } from './format'

export type Sheet = { name: string; rows: (string | number)[][] }
export function blockedDownload(notify?: (m: string) => void) {
  if (inFrame) { notify?.('This preview cannot save files. Exports work in the app on the shop computer.'); return true }
  return false
}
export function toExcel(file: string, sheets: Sheet[]) {
  const blob = new Blob([buildXlsx(sheets) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 60e3)
}
export function toPDF(db: DB, file: string, title: string, sub: string, sections: { heading?: string; rows: (string | number)[][]; foot?: (string | number)[] }[], landscape = false) {
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(128, 27, 58); doc.rect(0, 0, w, 56, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(db.shop.name, 36, 26)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`${db.shop.address}  ·  GSTIN ${db.shop.gstin}`, 36, 42)
  doc.setTextColor(30, 20, 20); doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text(title, 36, 82)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110, 96, 88); doc.text(sub, 36, 97)
  let y = 110
  sections.forEach(s => {
    if (s.heading) { doc.setTextColor(30, 20, 20); doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(s.heading, 36, y + 8); y += 14 }
    autoTable(doc, { startY: y, head: [s.rows[0].map(String)], body: s.rows.slice(1).map(r => r.map(c => typeof c === 'number' ? c.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(c ?? ''))),
      foot: s.foot ? [s.foot.map(c => typeof c === 'number' ? c.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(c))] : undefined,
      styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [245, 239, 230], textColor: [38, 26, 22] }, footStyles: { fillColor: [245, 239, 230], textColor: [38, 26, 22], fontStyle: 'bold' }, margin: { left: 36, right: 36 } })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18
  })
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140); doc.text(`Generated ${new Date().toLocaleString('en-IN')} · page ${i} of ${pages}`, 36, doc.internal.pageSize.getHeight() - 18) }
  doc.save(file)
}
