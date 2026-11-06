import type { DB } from './types'
import { dayKey, dt, d, r2 } from './format'
import { cashBook, supplierDue } from './ledger'
import { toExcel, toPDF, type Sheet } from './exporter'

const inRange = (iso: string, from: string, to: string) => { const k = dayKey(iso); return k >= from && k <= to }
const sup = (db: DB, id?: string) => db.suppliers.find(s => s.id === id)?.name || ''

export function productsSheet(db: DB): Sheet {
  return { name: 'Products & Stock', rows: [['SKU', 'Barcode', 'Product', 'Category', 'Brand', 'Size', 'Colour', 'Unit', 'HSN', 'GST type', 'Supplier', 'Purchase price', 'Selling price', 'Stock', 'Stock value (cost)', 'Stock value (MRP)', 'Low-stock alert'],
    ...db.variants.map(v => { const p = db.products.find(x => x.id === v.productId)!; return [v.sku, v.barcode, p.name, p.category, p.brand || '', v.size, v.colour, p.unit, p.hsn, p.gstType, sup(db, p.supplierId), v.cost, v.mrp, v.stock, r2(v.stock * v.cost), r2(v.stock * v.mrp), v.lowAt] })] }
}
export function salesRows(db: DB, from: string, to: string) {
  const bills = db.bills.filter(b => inRange(b.at, from, to))
  return {
    bills: [['Bill', 'Date', 'Customer', 'Mobile', 'Items', 'Gross', 'Discount', 'Taxable', 'CGST', 'SGST', 'Total', 'Paid by', 'Returned'],
      ...bills.map(b => { const c = db.customers.find(x => x.id === b.customerId); return [b.no, dt(b.at), c?.name || 'Walk-in', c?.mobile || '', b.lines.length, b.gross, b.discount, b.taxable, r2(b.tax / 2), r2(b.tax / 2), b.total, b.payments.map(p => `${p.mode} ${p.amount}`).join(', '), b.returnedAmount] })],
    items: [['Bill', 'Date', 'SKU/Barcode', 'Item', 'HSN', 'Qty', 'Rate', 'Discount', 'GST %', 'Taxable', 'Tax', 'Amount'],
      ...bills.flatMap(b => b.lines.map(l => [b.no, d(b.at), db.variants.find(v => v.id === l.variantId)?.barcode || '', `${l.productName} ${l.variantLabel}`, l.hsn, l.qty, l.mrp, l.discount, l.gstRate, l.taxable, l.tax, l.net]))],
    totals: ['Total', '', '', '', bills.length, r2(bills.reduce((s, b) => s + b.gross, 0)), r2(bills.reduce((s, b) => s + b.discount, 0)), r2(bills.reduce((s, b) => s + b.taxable, 0)), r2(bills.reduce((s, b) => s + b.tax, 0) / 2), r2(bills.reduce((s, b) => s + b.tax, 0) / 2), r2(bills.reduce((s, b) => s + b.total, 0)), '', r2(bills.reduce((s, b) => s + b.returnedAmount, 0))] as (string | number)[],
  }
}
export function purchaseRows(db: DB, from: string, to: string) {
  const ps = db.purchases.filter(p => inRange(p.at, from, to))
  return {
    list: [['No.', 'Date', 'Supplier', 'Supplier invoice', 'Items', 'Total', 'Paid', 'Balance'], ...ps.map(p => [p.no, d(p.at), sup(db, p.supplierId), p.invoiceNo, p.lines.length, p.total, p.paid, r2(p.total - p.paid)])],
    items: [['No.', 'Date', 'Supplier', 'SKU', 'Item', 'Qty', 'Cost', 'Amount'], ...ps.flatMap(p => p.lines.map(l => { const v = db.variants.find(x => x.id === l.variantId); const pr = v && db.products.find(x => x.id === v.productId); return [p.no, d(p.at), sup(db, p.supplierId), v?.sku || '', pr ? `${pr.name} ${v!.size} ${v!.colour}` : '', l.qty, l.cost, r2(l.qty * l.cost)] }))],
    totals: ['Total', '', '', '', ps.length, r2(ps.reduce((s, p) => s + p.total, 0)), r2(ps.reduce((s, p) => s + p.paid, 0)), r2(ps.reduce((s, p) => s + p.total - p.paid, 0))] as (string | number)[],
  }
}
export function partySheets(db: DB): Sheet[] {
  return [
    { name: 'Customers', rows: [['Name', 'Mobile', 'City', 'Birthday', 'Loyalty points', 'Credit limit', 'Due', 'Bills', 'Total spent', 'Customer since'], ...db.customers.map(c => { const bs = db.bills.filter(b => b.customerId === c.id); return [c.name, c.mobile, c.city || '', c.birthday || '', c.points, c.creditLimit, c.balance, bs.length, r2(bs.reduce((s, b) => s + b.total, 0)), d(c.createdAt)] })] },
    { name: 'Suppliers', rows: [['Name', 'City', 'Mobile', 'GSTIN', 'Purchases', 'Purchase value', 'Balance due'], ...db.suppliers.map(s => { const ps = db.purchases.filter(p => p.supplierId === s.id); return [s.name, s.city, s.mobile, s.gstin, ps.length, r2(ps.reduce((x, p) => x + p.total, 0)), supplierDue(db, s.id)] })] },
  ]
}
export function accountsRows(db: DB, from: string, to: string) {
  const cb = cashBook(db).filter(e => inRange(e.at, from, to))
  return {
    cashbook: [['Date', 'Account', 'Type', 'Ref', 'Party / note', 'In', 'Out'], ...cb.map(e => [dt(e.at), e.account === 'cash' ? 'Cash' : 'Bank/UPI', e.kind, e.ref, e.party, e.inAmt || '', e.outAmt || ''])],
    cbTotals: ['Total', '', '', '', '', r2(cb.reduce((s, e) => s + e.inAmt, 0)), r2(cb.reduce((s, e) => s + e.outAmt, 0))] as (string | number)[],
    expenses: [['Date', 'Category', 'Paid from', 'Note', 'Amount'], ...db.expenses.filter(e => inRange(e.at, from, to)).map(e => [d(e.at), e.category, e.mode === 'bank' ? 'Bank' : 'Cash', e.note, e.amount])],
    income: [['Date', 'Category', 'Received in', 'Note', 'Amount'], ...db.incomes.filter(e => inRange(e.at, from, to)).map(e => [d(e.at), e.category, e.mode === 'bank' ? 'Bank' : 'Cash', e.note, e.amount])],
  }
}
const sub = (from: string, to: string) => `${d(from)} to ${d(to)}`
export const exportsFor = {
  stockExcel: (db: DB) => toExcel(`stock-${dayKey(new Date().toISOString())}.xlsx`, [productsSheet(db)]),
  salesExcel: (db: DB, f: string, t: string) => { const s = salesRows(db, f, t); toExcel(`sales-${f}-to-${t}.xlsx`, [{ name: 'Bills', rows: [...s.bills, s.totals] }, { name: 'Items sold', rows: s.items }]) },
  salesPDF: (db: DB, f: string, t: string) => { const s = salesRows(db, f, t); toPDF(db, `sales-${f}-to-${t}.pdf`, 'Sales report', sub(f, t), [{ rows: s.bills.map(r => [r[0], r[1], r[2], r[5], r[6], r[7], r[8], r[9], r[10], r[11]]), foot: [s.totals[0], '', '', s.totals[5], s.totals[6], s.totals[7], s.totals[8], s.totals[9], s.totals[10], ''] }], true) },
  purchaseExcel: (db: DB, f: string, t: string) => { const p = purchaseRows(db, f, t); toExcel(`purchases-${f}-to-${t}.xlsx`, [{ name: 'Purchases', rows: [...p.list, p.totals] }, { name: 'Items received', rows: p.items }]) },
  purchasePDF: (db: DB, f: string, t: string) => { const p = purchaseRows(db, f, t); toPDF(db, `purchases-${f}-to-${t}.pdf`, 'Purchase report', sub(f, t), [{ rows: p.list, foot: p.totals }]) },
  partiesExcel: (db: DB) => toExcel(`customers-suppliers-${dayKey(new Date().toISOString())}.xlsx`, partySheets(db)),
  accountsExcel: (db: DB, f: string, t: string) => { const a = accountsRows(db, f, t); toExcel(`accounts-${f}-to-${t}.xlsx`, [{ name: 'Cash book', rows: [...a.cashbook, a.cbTotals] }, { name: 'Expenses', rows: a.expenses }, { name: 'Income', rows: a.income }]) },
  accountsPDF: (db: DB, f: string, t: string) => { const a = accountsRows(db, f, t); toPDF(db, `accounts-${f}-to-${t}.pdf`, 'Accounts: cash book, income and expenses', sub(f, t), [{ heading: 'Cash book', rows: a.cashbook, foot: a.cbTotals }, { heading: 'Income', rows: a.income }, { heading: 'Expenses', rows: a.expenses }], true) },
}

export function billPDF(db: DB, b: import('./types').Bill) {
  const c = db.customers.find(x => x.id === b.customerId)
  const rate = new Map<number, { t: number; g: number }>(); b.lines.forEach(l => { const m = rate.get(l.gstRate) || { t: 0, g: 0 }; m.t += l.taxable; m.g += l.tax; rate.set(l.gstRate, m) })
  toPDF(db, `bill-${b.no}.pdf`, `Tax invoice ${b.no}`, `${dt(b.at)}${c ? ` · ${c.name} (${c.mobile})` : ''}`, [
    { rows: [['#', 'Item', 'HSN', 'Qty', 'Rate', 'Discount', 'GST %', 'Taxable', 'Amount'], ...b.lines.map((l, i) => [i + 1, `${l.productName} ${l.variantLabel}`, l.hsn, l.unit === 'm' ? `${l.qty} m` : l.qty, l.mrp, l.discount, l.gstRate, l.taxable, l.net])], foot: ['', 'Total', '', '', '', b.discount, '', b.taxable, b.total] },
    { heading: 'GST summary', rows: [['GST %', 'Taxable', 'CGST', 'SGST'], ...[...rate.entries()].map(([r, m]) => [r, r2(m.t), r2(m.g / 2), r2(m.g / 2)])] },
    { heading: 'Payment', rows: [['Mode', 'Amount'], ...b.payments.map(p => [p.mode.toUpperCase() + (p.ref ? ' ' + p.ref : ''), p.amount])], foot: ['Bill total', b.total] },
  ])
}
