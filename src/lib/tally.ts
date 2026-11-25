/* Tally import file (Tally Prime / ERP 9: Gateway of Tally → Import → Masters and Transactions, XML).
   Creates the ledgers it needs, then one voucher per bill, return, purchase, payment and expense.
   Ledger names are the common Indian defaults; the accountant can rename them in Tally after the first import. */
import type { DB } from './types'
import { dayKey, r2 } from './format'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const tdate = (iso: string) => dayKey(iso).replace(/-/g, '')
const inRange = (iso: string, from: string, to: string) => { const k = dayKey(iso); return k >= from && k <= to }
const amt = (n: number) => r2(n).toFixed(2)

export const LEDGER = {
  cash: 'Cash', bank: 'Bank Account', upi: 'UPI Collections', card: 'Card Collections',
  vouchers: 'Gift Vouchers & Credit Notes', points: 'Loyalty Points Redeemed', roundOff: 'Round Off', purchases: 'Purchase Account',
  sales: (rate: number) => `Sales @ ${rate}%`, cgst: (rate: number) => `Output CGST @ ${rate / 2}%`, sgst: (rate: number) => `Output SGST @ ${rate / 2}%`,
}

type Entry = { ledger: string; dr: number }   // dr > 0 = debit, dr < 0 = credit
function voucher(type: string, no: string, iso: string, party: string, narration: string, entries: Entry[]) {
  const rows = entries.filter(e => Math.abs(e.dr) >= 0.005).map(e =>
    `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(e.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${e.dr > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${amt(-e.dr)}</AMOUNT></ALLLEDGERENTRIES.LIST>`).join('')
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${type}" ACTION="Create"><DATE>${tdate(iso)}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><VOUCHERNUMBER>${esc(no)}</VOUCHERNUMBER><PARTYLEDGERNAME>${esc(party)}</PARTYLEDGERNAME><NARRATION>${esc(narration)}</NARRATION>${rows}</VOUCHER></TALLYMESSAGE>`
}
const ledgerMaster = (name: string, parent: string) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${esc(name)}" ACTION="Create"><NAME.LIST><NAME>${esc(name)}</NAME></NAME.LIST><PARENT>${esc(parent)}</PARENT></LEDGER></TALLYMESSAGE>`

/** balances a voucher to the paisa: any leftover goes to Round Off */
function balance(e: Entry[]): Entry[] { const diff = r2(e.reduce((s, x) => s + x.dr, 0)); return diff ? [...e, { ledger: LEDGER.roundOff, dr: -diff }] : e }

export function tallyXml(db: DB, from: string, to: string): { xml: string; counts: Record<string, number> } {
  const cust = (id?: string) => db.customers.find(c => c.id === id)
  const custLedger = (id?: string) => { const c = cust(id); return c ? `${c.name} (${c.mobile})` : LEDGER.cash }
  const supLedger = (id: string) => db.suppliers.find(s => s.id === id)?.name || 'Supplier'
  const acct = (m?: string) => (m === 'bank' ? LEDGER.bank : LEDGER.cash)
  const masters = new Map<string, string>()
  const need = (name: string, parent: string) => { if (!masters.has(name)) masters.set(name, parent) }
  const out: string[] = []; const counts = { sales: 0, returns: 0, purchases: 0, payments: 0, expenses: 0, receipts: 0 }

  for (const b of db.bills.filter(x => inRange(x.at, from, to))) {
    const e: Entry[] = []
    for (const p of b.payments) {
      const l = p.mode === 'cash' ? LEDGER.cash : p.mode === 'upi' ? LEDGER.upi : p.mode === 'card' ? LEDGER.card : p.mode === 'credit' ? custLedger(b.customerId) : p.mode === 'voucher' ? LEDGER.vouchers : LEDGER.points
      if (p.mode === 'credit') need(l, 'Sundry Debtors')
      e.push({ ledger: l, dr: p.amount })
    }
    const rates = new Map<number, { taxable: number; tax: number }>()
    for (const l of b.lines) { const t = rates.get(l.gstRate) || { taxable: 0, tax: 0 }; t.taxable += l.taxable; t.tax += l.tax; rates.set(l.gstRate, t) }
    for (const [rate, t] of rates) {
      need(LEDGER.sales(rate), 'Sales Accounts'); e.push({ ledger: LEDGER.sales(rate), dr: -r2(t.taxable) })
      if (rate) { need(LEDGER.cgst(rate), 'Duties & Taxes'); need(LEDGER.sgst(rate), 'Duties & Taxes'); e.push({ ledger: LEDGER.cgst(rate), dr: -r2(t.tax / 2) }, { ledger: LEDGER.sgst(rate), dr: -r2(t.tax / 2) }) }
    }
    out.push(voucher('Sales', b.no, b.at, custLedger(b.customerId), `Counter bill ${b.no}`, balance(e))); counts.sales++
  }
  for (const r of db.returns.filter(x => inRange(x.at, from, to))) {
    const bill = db.bills.find(b => b.id === r.billId)
    const e: Entry[] = [{ ledger: r.refundMode === 'cash' ? LEDGER.cash : LEDGER.vouchers, dr: -r.amount }]
    for (const l of r.lines) {
      const rate = bill?.lines.find(x => x.variantId === l.variantId)?.gstRate ?? 5
      const taxable = r2(l.amount / (1 + rate / 100)); const tax = r2(l.amount - taxable)
      need(LEDGER.sales(rate), 'Sales Accounts'); e.push({ ledger: LEDGER.sales(rate), dr: taxable })
      if (rate) { need(LEDGER.cgst(rate), 'Duties & Taxes'); need(LEDGER.sgst(rate), 'Duties & Taxes'); e.push({ ledger: LEDGER.cgst(rate), dr: r2(tax / 2) }, { ledger: LEDGER.sgst(rate), dr: r2(tax / 2) }) }
    }
    out.push(voucher('Credit Note', r.no, r.at, custLedger(bill?.customerId), `Return against ${r.billNo}${r.voucherCode ? ', credit note ' + r.voucherCode : ''}`, balance(e))); counts.returns++
  }
  for (const p of db.purchases.filter(x => inRange(x.at, from, to))) {
    const s = supLedger(p.supplierId); need(s, 'Sundry Creditors')
    out.push(voucher('Purchase', p.no, p.at, s, `Supplier invoice ${p.invoiceNo || '-'}`, [{ ledger: LEDGER.purchases, dr: p.total }, { ledger: s, dr: -p.total }])); counts.purchases++
    if (p.paid > 0) { out.push(voucher('Payment', p.no + '-PAY', p.at, s, `Paid with purchase ${p.no}`, [{ ledger: s, dr: p.paid }, { ledger: acct(p.payMode), dr: -p.paid }])); counts.payments++ }
  }
  for (const sp of db.supplierPayments.filter(x => inRange(x.at, from, to))) {
    const s = supLedger(sp.supplierId); need(s, 'Sundry Creditors')
    out.push(voucher('Payment', 'SP-' + sp.id.slice(0, 8), sp.at, s, sp.note || 'Supplier payment', [{ ledger: s, dr: sp.amount }, { ledger: acct(sp.mode), dr: -sp.amount }])); counts.payments++
  }
  for (const x of db.expenses.filter(e => inRange(e.at, from, to))) {
    need(x.category, 'Indirect Expenses')
    out.push(voucher('Payment', 'EXP-' + x.id.slice(0, 8), x.at, acct(x.mode), x.note || x.category, [{ ledger: x.category, dr: x.amount }, { ledger: acct(x.mode), dr: -x.amount }])); counts.expenses++
  }
  for (const c of db.creditPayments.filter(e => inRange(e.at, from, to))) {
    const l = custLedger(c.customerId); need(l, 'Sundry Debtors')
    out.push(voucher('Receipt', 'CR-' + c.id.slice(0, 8), c.at, l, 'Credit collected', [{ ledger: c.mode === 'cash' ? LEDGER.cash : LEDGER.bank, dr: c.amount }, { ledger: l, dr: -c.amount }])); counts.receipts++
  }
  need(LEDGER.cash, 'Cash-in-Hand'); need(LEDGER.bank, 'Bank Accounts'); need(LEDGER.upi, 'Bank Accounts'); need(LEDGER.card, 'Bank Accounts')
  need(LEDGER.vouchers, 'Current Liabilities'); need(LEDGER.points, 'Indirect Expenses'); need(LEDGER.roundOff, 'Indirect Expenses'); need(LEDGER.purchases, 'Purchase Accounts')
  const ms = [...masters].map(([n, p]) => ledgerMaster(n, p)).join('')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC><REQUESTDATA>${ms}${out.join('')}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`
  return { xml, counts }
}
