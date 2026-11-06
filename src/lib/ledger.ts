import type { DB, AcctMode, PayMode } from './types'
import { dayKey, r2 } from './format'

export interface CashEntry { at: string; account: AcctMode; kind: string; ref: string; party: string; inAmt: number; outAmt: number }
const acct = (m: PayMode | AcctMode | undefined): AcctMode | null => m === 'cash' ? 'cash' : m === 'upi' || m === 'card' || m === 'bank' ? 'bank' : null

/* Every money movement in one list: the cash book / day book. */
export function cashBook(db: DB): CashEntry[] {
  const cust = (id?: string) => db.customers.find(c => c.id === id)?.name || 'Walk-in'
  const sup = (id: string) => db.suppliers.find(s => s.id === id)?.name || ''
  const out: CashEntry[] = []
  db.bills.forEach(b => b.payments.forEach(p => { const a = acct(p.mode); if (a && p.amount) out.push({ at: b.at, account: a, kind: 'Sale', ref: b.no, party: cust(b.customerId), inAmt: p.amount, outAmt: 0 }) }))
  db.creditPayments.forEach(p => { const a = acct(p.mode); if (a) out.push({ at: p.at, account: a, kind: 'Due collected', ref: '', party: cust(p.customerId), inAmt: p.amount, outAmt: 0 }) })
  db.returns.filter(r => r.refundMode === 'cash').forEach(r => out.push({ at: r.at, account: 'cash', kind: 'Refund', ref: r.no, party: r.billNo, inAmt: 0, outAmt: r.amount }))
  db.purchases.filter(p => p.paid > 0).forEach(p => out.push({ at: p.at, account: p.payMode, kind: 'Purchase paid', ref: p.no, party: sup(p.supplierId), inAmt: 0, outAmt: p.paid }))
  db.supplierPayments.forEach(p => out.push({ at: p.at, account: p.mode, kind: 'Supplier payment', ref: p.note, party: sup(p.supplierId), inAmt: 0, outAmt: p.amount }))
  db.expenses.forEach(e => out.push({ at: e.at, account: e.mode || 'cash', kind: 'Expense', ref: e.category, party: e.note, inAmt: 0, outAmt: e.amount }))
  db.incomes.forEach(e => out.push({ at: e.at, account: e.mode, kind: 'Income', ref: e.category, party: e.note, inAmt: e.amount, outAmt: 0 }))
  return out.sort((a, b) => a.at.localeCompare(b.at))
}
export function balances(db: DB, upto?: string) {
  let cash = db.shop.openingCash, bank = db.shop.openingBank
  cashBook(db).forEach(e => { if (upto && dayKey(e.at) > upto) return; const d = e.inAmt - e.outAmt; if (e.account === 'cash') cash += d; else bank += d })
  return { cash: r2(cash), bank: r2(bank) }
}

export interface LedgerRow { at: string; text: string; ref: string; debit: number; credit: number; balance: number }
/* Customer: debit = sold on credit, credit = money received. Balance = what they owe us. */
export function customerLedger(db: DB, id: string): LedgerRow[] {
  const rows: Omit<LedgerRow, 'balance'>[] = []
  db.bills.filter(b => b.customerId === id).forEach(b => { const c = b.payments.filter(p => p.mode === 'credit').reduce((s, p) => s + p.amount, 0); if (c) rows.push({ at: b.at, text: 'Sale on credit', ref: b.no, debit: c, credit: 0 }) })
  db.creditPayments.filter(p => p.customerId === id).forEach(p => rows.push({ at: p.at, text: `Received (${p.mode})`, ref: '', debit: 0, credit: p.amount }))
  return running(rows, (r, b) => b + r.debit - r.credit)
}
/* Supplier: credit = goods bought, debit = money paid. Balance = what we owe them. */
export function supplierLedger(db: DB, id: string): LedgerRow[] {
  const rows: Omit<LedgerRow, 'balance'>[] = []
  db.purchases.filter(p => p.supplierId === id).forEach(p => { rows.push({ at: p.at, text: `Purchase ${p.invoiceNo ? 'inv ' + p.invoiceNo : ''}`, ref: p.no, debit: 0, credit: p.total }); if (p.paid) rows.push({ at: p.at, text: `Paid with purchase (${p.payMode})`, ref: p.no, debit: p.paid, credit: 0 }) })
  db.supplierPayments.filter(p => p.supplierId === id).forEach(p => rows.push({ at: p.at, text: `Payment (${p.mode})`, ref: p.note, debit: p.amount, credit: 0 }))
  return running(rows, (r, b) => b + r.credit - r.debit)
}
function running(rows: Omit<LedgerRow, 'balance'>[], f: (r: Omit<LedgerRow, 'balance'>, b: number) => number): LedgerRow[] {
  let b = 0; return rows.sort((a, c) => a.at.localeCompare(c.at)).map(r => { b = r2(f(r, b)); return { ...r, balance: b } })
}
export const supplierDue = (db: DB, id: string) => { const l = supplierLedger(db, id); return l.length ? l[l.length - 1].balance : 0 }
