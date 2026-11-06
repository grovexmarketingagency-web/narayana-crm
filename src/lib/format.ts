export const inr = (n: number, dp = 0) =>
  (n < 0 ? '−₹' : '₹') + (Math.round(Math.abs(n) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp === 0 ? 0 : 2 })
export const inr2 = (n: number) => inr(n, 2)
export const r2 = (n: number) => Math.round(n * 100) / 100
export const qtyFmt = (q: number, unit: string) => (unit === 'm' ? `${r2(q)} m` : `${r2(q)}`)
export const dt = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
export const d = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
export const todayISO = () => new Date().toISOString().slice(0, 10)
export const dayKey = (iso: string) => {
  const x = new Date(iso); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
export const localToday = () => dayKey(new Date().toISOString())
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
export function downloadCSV(name: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(c => { const s = String(c ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export const inFrame = (() => { try { return window.self !== window.top } catch { return true } })()
export function printPage(notify?: (m: string) => void) {
  if (inFrame) { notify?.('This preview cannot open the print dialog. Printing works in the app on the shop computer.'); return }
  window.print()
}
