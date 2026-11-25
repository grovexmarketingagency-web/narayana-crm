/* Every change to the shop's data is one of these operations.
   They are pure and deterministic: the same operation on the same data always gives the same result,
   because ids and times come in with the operation. The app runs them straight away (so billing works
   offline) and the server runs them again to make the official copy, exactly once per operation id. */
import type { DB, Draft, Role, Alteration, Customer, Staff } from './types'
import { canSee, readOnly } from './access'
import { argsS, type OpName, type Args } from './schemas'
import { computeDraft } from './calc'
import { ensureSection, makeSku, nextBarcode } from './codes'
import { r2 } from './format'

export interface Ctx {
  opId: string; staffId: string; at: string
  /** server only: checks an owner-approval token for a bill and returns the approving owner's id */
  approve?: (billId: string, token: string) => string | null
}
export interface QueuedOp<N extends OpName = OpName> { id: string; name: N; args: Args<N>; staffId: string; at: string }

const nextNo = (d: DB, k: string) => (d.counters[k] = (d.counters[k] || 0) + 1)
const vName = (d: DB, vid: string) => { const v = d.variants.find(x => x.id === vid); const p = v && d.products.find(x => x.id === v.productId); return p ? `${p.name} ${[v!.size, v!.colour].filter(Boolean).join('/')}` : vid }
const upsert = <T extends { id: string }>(list: T[], rec: T) => { const i = list.findIndex(x => x.id === rec.id); if (i >= 0) list[i] = rec; else list.push(rec) }
export class OpError extends Error {}
function need(cond: unknown, msg: string): asserts cond { if (!cond) throw new OpError(msg) }

type Def<N extends OpName> = {
  /** screens that allow this change; the user's role must be allowed at least one of them */
  pages: string[]; ownerOnly?: boolean
  run: (d: DB, a: Args<N>, c: Ctx) => void
  audit?: (d: DB, a: Args<N>) => [string, string]
}
type Defs = { [N in OpName]: Def<N> }

export const OPS: Defs = {
  checkout: {
    pages: ['/billing'],
    run(d, a, c) {
      need(!d.bills.some(b => b.id === a.billId), 'Bill already saved')
      const draft: Draft = { id: a.billId, label: '', lines: a.lines, customerId: a.customerId, salesmanId: a.salesmanId, billDiscount: a.billDiscount, couponCode: a.couponCode, held: false, createdAt: c.at }
      for (const l of a.lines) need(d.variants.some(v => v.id === l.variantId), 'An item on the bill no longer exists')
      const cp = computeDraft(d, draft)           // the server recalculates prices, offers and GST itself
      const paid = r2(a.payments.reduce((s, p) => s + p.amount, 0))
      need(Math.abs(paid - cp.total) <= 0.5, `Payments (${paid}) do not match the bill total (${cp.total})`)
      need(cp.lines.length > 0, 'Add at least one item')
      // discount above the person's limit needs the owner's approval (checked by the server)
      const me = d.staff.find(s => s.id === c.staffId)
      const discPct = cp.gross ? ((cp.gross - cp.total) / cp.gross) * 100 : 0
      if (c.approve && (!me || (me.role !== 'owner' && discPct > me.maxDiscountPct + 0.01)))
        need(a.approval && c.approve(a.billId, a.approval), "This discount is above the cashier's limit and needs the owner's PIN")
      const cust = d.customers.find(x => x.id === a.customerId)
      const credit = a.payments.filter(p => p.mode === 'credit').reduce((s, p) => s + p.amount, 0)
      const pts = a.payments.filter(p => p.mode === 'points').reduce((s, p) => s + p.amount, 0)
      need(!(credit || pts) || cust, 'Credit and points need a customer')
      const ptsNeeded = Math.ceil(pts / (d.shop.pointValue || 1))
      const n = nextNo(d, 'bill')
      const bill = { id: a.billId, no: 'NT-' + String(n).padStart(5, '0'), at: c.at, staffId: c.staffId, customerId: cust?.id, salesmanId: a.salesmanId,
        lines: cp.lines, gross: cp.gross, discount: cp.discount, offerLabel: cp.offerLabel, couponCode: cp.couponValid ? a.couponCode.toUpperCase() : undefined,
        total: cp.total, taxable: cp.taxable, tax: cp.tax, roundOff: cp.roundOff, payments: a.payments.filter(p => p.amount > 0),
        status: (credit >= cp.total ? 'credit' : credit > 0 ? 'partial' : 'paid') as 'credit' | 'partial' | 'paid',
        pointsEarned: cust ? Math.floor((cp.total - pts) / 100) * d.shop.pointsPer100 : 0, pointsRedeemed: ptsNeeded, returnedAmount: 0 }
      d.bills.push(bill)
      cp.lines.forEach(l => { const v = d.variants.find(x => x.id === l.variantId)!; v.stock = r2(v.stock - l.qty); v.lastSoldAt = c.at })
      if (cust) { const cu = d.customers.find(x => x.id === cust.id)!; cu.balance = r2(cu.balance + credit); cu.points = Math.max(0, cu.points - ptsNeeded) + bill.pointsEarned }
      a.payments.filter(p => p.mode === 'voucher').forEach(p => { const v = d.vouchers.find(x => x.code.toUpperCase() === (p.ref || '').toUpperCase()); if (v) v.balance = r2(Math.max(0, v.balance - p.amount)) })
    },
    audit: (d, a) => ['bill', `Bill ${d.bills.find(b => b.id === a.billId)?.no} for ₹${d.bills.find(b => b.id === a.billId)?.total}${a.approval ? ' (discount approved by owner PIN)' : ''}`],
  },
  upsertCustomer: {
    pages: ['/customers', '/billing', '/alterations'],
    run(d, a, c) {
      const ex = d.customers.find(x => x.id === a.id)
      need(!d.customers.some(x => x.mobile === a.mobile && x.id !== a.id), 'This mobile number is already saved for another customer')
      const { isNew: _n, ...rest } = a
      if (ex) Object.assign(ex, rest)
      else d.customers.push({ id: a.id, mobile: a.mobile, name: a.name, points: 0, creditLimit: a.creditLimit ?? 5000, balance: 0, birthday: a.birthday, city: a.city, createdAt: c.at } as Customer)
    },
    audit: (_d, a) => ['customer', `Saved customer ${a.name}`],
  },
  collectCredit: {
    pages: ['/credit'],
    run(d, a, c) { const cu = d.customers.find(x => x.id === a.customerId); need(cu, 'Customer not found'); cu.balance = r2(Math.max(0, cu.balance - a.amount)); d.creditPayments.unshift({ id: a.id, customerId: a.customerId, amount: a.amount, mode: a.mode, at: c.at }) },
    audit: (d, a) => ['credit', `Collected ₹${a.amount} from ${d.customers.find(x => x.id === a.customerId)?.name}`],
  },
  saveProduct: {
    pages: ['/products'],
    run(d, { product: p, variants }) {
      upsert(d.products, p); ensureSection(d, p.category)
      const keep = new Set(variants.map(v => v.id))
      d.variants = d.variants.filter(v => v.productId !== p.id || keep.has(v.id))
      variants.forEach(v0 => { const v = { ...v0, productId: p.id }; if (!v.sku) v.sku = makeSku(d, p, v); if (!v.barcode) v.barcode = nextBarcode(d, p.category)
        need(!d.variants.some(x => x.barcode === v.barcode && x.id !== v.id), `Barcode ${v.barcode} is already used by another item`); upsert(d.variants, v) })
    },
    audit: (_d, a) => ['product', `Saved product ${a.product.name}`],
  },
  deleteProduct: {
    pages: ['/products'],
    run(d, a) { d.products = d.products.filter(x => x.id !== a.id); d.variants = d.variants.filter(v => v.productId !== a.id) },
    audit: (_d, a) => ['product', `Deleted product ${a.id}`],
  },
  importProducts: {
    pages: ['/products'],
    run(d, { rows }, c) {
      rows.forEach(r => {
        let p = d.products.find(x => x.name.toLowerCase() === r.name.toLowerCase())
        if (!p) { p = { id: r.productId, name: r.name, brand: r.brand, category: r.category || 'General', hsn: r.hsn || '', gstType: r.gstType, unit: r.unit, createdAt: c.at }; d.products.push(p); ensureSection(d, p.category) }
        const vv = { size: r.size || '', colour: r.colour || '' }
        d.variants.push({ id: r.variantId, productId: p.id, ...vv, sku: r.sku || makeSku(d, p, vv), barcode: r.barcode || nextBarcode(d, p.category), mrp: r.mrp, cost: r.cost, stock: r.stock, lowAt: d.shop.lowStockDefault, createdAt: c.at })
      })
    },
    audit: (_d, a) => ['import', `Imported ${a.rows.length} rows`],
  },
  addPurchase: {
    pages: ['/purchases'],
    run(d, a) {
      need(d.suppliers.some(s => s.id === a.supplierId), 'Supplier not found')
      const n = nextNo(d, 'pur'); const total = r2(a.lines.reduce((s, l) => s + l.qty * l.cost, 0))
      d.purchases.unshift({ id: a.id, no: 'PUR-' + String(n).padStart(3, '0'), supplierId: a.supplierId, invoiceNo: a.invoiceNo, at: a.at, lines: a.lines, total, paid: Math.min(a.paid, total), payMode: a.payMode })
      a.lines.forEach(l => { const v = d.variants.find(x => x.id === l.variantId); need(v, 'An item on the purchase no longer exists'); v.stock = r2(v.stock + l.qty); v.cost = l.cost })
    },
    audit: (d, a) => ['purchase', `Stock inward from ${d.suppliers.find(s => s.id === a.supplierId)?.name}`],
  },
  startCount: { pages: ['/stock-count'], run(d, a, c) { d.stockCounts.unshift({ id: a.id, startedAt: c.at, status: 'open', scanned: {}, category: a.category }) }, audit: (_d, a) => ['stock count', `Started count ${a.category || 'all'}`] },
  countScan: {
    pages: ['/stock-count'],
    run(d, a) { const c = d.stockCounts.find(x => x.id === a.id); need(c && c.status === 'open', 'This count is closed'); c.scanned[a.variantId] = r2((c.scanned[a.variantId] || 0) + a.qty); if (c.scanned[a.variantId] <= 0) delete c.scanned[a.variantId] },
  },
  finishCount: {
    pages: ['/stock-count'],
    run(d, a) {
      const c = d.stockCounts.find(x => x.id === a.id); need(c && c.status === 'open', 'This count is closed'); c.status = a.apply ? 'applied' : 'cancelled'
      if (a.apply) d.variants.forEach(v => { const p = d.products.find(x => x.id === v.productId); if (!c.category || p?.category === c.category) v.stock = c.scanned[v.id] || 0 })
    },
    audit: (_d, a) => ['stock count', a.apply ? 'Applied stock count' : 'Cancelled stock count'],
  },
  adjustStock: { pages: ['/products'], run(d, a) { const v = d.variants.find(x => x.id === a.variantId); need(v, 'Item not found'); v.stock = a.stock }, audit: (d, a) => ['stock', `Set stock of ${vName(d, a.variantId)} to ${a.stock}`] },
  doReturn: {
    pages: ['/returns'],
    run(d, a, c) {
      const b = d.bills.find(x => x.id === a.billId); need(b, 'Bill not found')
      let amount = 0
      const out = a.lines.filter(l => l.qty > 0).map(l => {
        const bl = b.lines.find(x => x.variantId === l.variantId); need(bl, 'Item was not on this bill')
        const already = d.returns.filter(r => r.billId === b.id).reduce((s, r) => s + r.lines.filter(x => x.variantId === l.variantId).reduce((t, x) => t + x.qty, 0), 0)
        need(l.qty <= bl.qty - already + 1e-9, `Only ${r2(bl.qty - already)} of ${bl.productName} can still be returned`)
        const amt = r2(bl.net / bl.qty * l.qty); amount += amt
        return { variantId: l.variantId, label: `${bl.productName} ${bl.variantLabel}`, qty: l.qty, amount: amt }
      })
      need(out.length, 'Pick at least one item to return')
      amount = Math.round(amount)
      const n = nextNo(d, 'ret'); let code: string | undefined
      if (a.refundMode === 'credit_note') { code = 'CN-' + String(nextNo(d, 'cn')).padStart(4, '0'); d.vouchers.unshift({ id: a.id + '-cn', code, kind: 'credit_note', amount, balance: amount, customerId: b.customerId, createdAt: c.at, note: `Return against ${b.no}` }) }
      d.returns.unshift({ id: a.id, no: 'RET-' + String(n).padStart(3, '0'), billId: b.id, billNo: b.no, at: c.at, lines: out, amount, refundMode: a.refundMode, voucherCode: code })
      out.forEach(l => { const v = d.variants.find(x => x.id === l.variantId); if (v) v.stock = r2(v.stock + l.qty) })
      b.returnedAmount = r2(b.returnedAmount + amount)
    },
    audit: (d, a) => { const r = d.returns.find(x => x.id === a.id); return ['return', `Return on ${r?.billNo}: ₹${r?.amount} ${a.refundMode === 'cash' ? 'refunded' : 'as credit note ' + r?.voucherCode}`] },
  },
  issueGiftVoucher: {
    pages: ['/returns'],
    run(d, a, c) { const code = 'GIFT-' + nextNo(d, 'gv'); d.vouchers.unshift({ id: a.id, code, kind: 'gift', amount: a.amount, balance: a.amount, customerId: a.customerId, createdAt: c.at, note: a.note }); d.incomes.unshift({ id: a.id + '-inc', at: c.at, category: 'Gift voucher sale', amount: a.amount, mode: a.mode, note: code }) },
    audit: (_d, a) => ['voucher', `Issued gift voucher ₹${a.amount}`],
  },
  saveAlteration: {
    pages: ['/alterations'],
    run(d, { alteration: a, newId }, c) {
      const ex = a.id && d.alterations.find(x => x.id === a.id)
      if (ex) Object.assign(ex, a)
      else { need(newId, 'Missing id'); d.alterations.unshift({ mobile: '', work: '', charge: 0, paid: false, status: 'pending', tailor: '', ...a, id: newId, no: 'ALT-' + String(nextNo(d, 'alt')).padStart(3, '0'), createdAt: c.at } as Alteration) }
    },
    audit: (_d, { alteration: a }) => ['alteration', `${a.id ? 'Updated' : 'New'} alteration for ${a.customerName}${a.status ? ' → ' + a.status : ''}`],
  },
  saveOffer: { pages: ['/offers', '/reports'], run(d, a) { upsert(d.offers, a.offer) }, audit: (_d, a) => ['offer', `Saved offer ${a.offer.name}`] },
  deleteOffer: { pages: ['/offers'], run(d, a) { d.offers = d.offers.filter(x => x.id !== a.id) }, audit: () => ['offer', 'Deleted offer'] },
  saveSalesman: { pages: ['/salesmen'], run(d, a) { need(!d.salesmen.some(s => s.code === a.salesman.code && s.id !== a.salesman.id), 'Card code already used'); upsert(d.salesmen, a.salesman) }, audit: (_d, a) => ['salesman', `Saved salesman ${a.salesman.name}`] },
  saveSupplier: { pages: ['/suppliers', '/purchases'], run(d, a) { upsert(d.suppliers, a.supplier) }, audit: (_d, a) => ['supplier', `Saved supplier ${a.supplier.name}`] },
  addExpense: { pages: ['/accounts'], run(d, a) { d.expenses.unshift({ id: a.id, at: a.at, category: a.category, amount: a.amount, note: a.note, mode: a.mode }) }, audit: (_d, a) => ['expense', `${a.category} ₹${a.amount}`] },
  deleteExpense: { pages: ['/accounts'], run(d, a) { d.expenses = d.expenses.filter(x => x.id !== a.id) }, audit: () => ['expense', 'Deleted expense'] },
  addIncome: { pages: ['/accounts'], run(d, a) { d.incomes.unshift({ id: a.id, at: a.at, category: a.category, amount: a.amount, note: a.note, mode: a.mode }) }, audit: (_d, a) => ['income', `${a.category} ₹${a.amount}`] },
  deleteIncome: { pages: ['/accounts'], run(d, a) { d.incomes = d.incomes.filter(x => x.id !== a.id) }, audit: () => ['income', 'Deleted income entry'] },
  paySupplier: { pages: ['/accounts'], run(d, a) { need(d.suppliers.some(s => s.id === a.supplierId), 'Supplier not found'); d.supplierPayments.unshift({ id: a.id, supplierId: a.supplierId, amount: a.amount, mode: a.mode, at: a.at, note: a.note }) }, audit: (d, a) => ['supplier payment', `Paid ₹${a.amount} to ${d.suppliers.find(s => s.id === a.supplierId)?.name}`] },
  saveStaff: {
    pages: ['/settings'], ownerOnly: true,
    run(d, { staff }) {
      const ex = d.staff.find(x => x.id === staff.id)
      need(ex || staff.pin, 'A new staff member needs a PIN')
      const owners = d.staff.filter(s => s.role === 'owner' && s.active && s.id !== staff.id).length
      need(owners > 0 || (staff.role === 'owner' && staff.active), 'Keep at least one active owner')
      const rec = { ...ex, ...staff }; if (!staff.pin) rec.pin = ex?.pin
      if (staff.pin) delete rec.pinHash      // the server replaces a new PIN with its hash before saving
      upsert(d.staff, rec)
    },
    audit: (_d, a) => ['staff', `Saved staff ${a.staff.name}${a.staff.pin ? ' (PIN changed)' : ''}`],
  },
  saveShop: { pages: ['/settings'], ownerOnly: true, run(d, a) { d.shop = { ...a.shop, sections: d.shop.sections } }, audit: () => ['settings', 'Updated shop settings'] },
  saveSections: {
    pages: ['/settings'], ownerOnly: true,
    run(d, { sections }) {
      const names = new Set<string>(), codes = new Set<string>()
      for (const s of sections) {
        need(!names.has(s.name.toLowerCase()), `Section "${s.name}" is listed twice`); names.add(s.name.toLowerCase())
        need(!codes.has(s.code), `Code ${s.code} is used by two sections`); codes.add(s.code)
      }
      for (const s of sections) if (s.was && s.was !== s.name) {
        d.products.forEach(p => { if (p.category === s.was) p.category = s.name })
        d.offers.forEach(o => { if (o.category === s.was) o.category = s.name })
      }
      for (const old of d.shop.sections) {
        const kept = sections.some(s => s.was === old.name || (!s.was && s.name.toLowerCase() === old.name.toLowerCase()))
        need(kept || !d.products.some(p => p.category === old.name), `Section "${old.name}" still has items, so it cannot be removed`)
      }
      d.shop.sections = sections.map(({ name, code }) => ({ name, code }))
      d.products.forEach(p => ensureSection(d, p.category))
    },
    audit: (_d, a) => ['settings', `Saved ${a.sections.length} sections`],
  },
  setShopPrefs: { pages: ['/labels', '/backup'], run(d, a) { if (a.labelCode) d.shop.labelCode = a.labelCode; if (a.autoBackupHours !== undefined) d.shop.autoBackupHours = a.autoBackupHours }, audit: () => ['settings', 'Changed label / backup preference'] },
  savePermissions: { pages: ['/settings'], ownerOnly: true, run(d, a) { d.permissions[a.role as Role] = a.pages }, audit: (_d, a) => ['permissions', `Changed screens for ${a.role}`] },
}

export function validate<N extends OpName>(name: N, args: unknown): Args<N> {
  const s = argsS[name]; if (!s) throw new OpError('Unknown change type')
  const r = s.safeParse(args)
  if (!r.success) { const i = r.error.issues[0]; throw new OpError(`Invalid ${i.path.join('.') || 'data'}: ${i.message}`) }
  return r.data as Args<N>
}

/* Applies one operation to a draft of the data (plain object or an immer draft) and records it in the change history. */
export function applyOp(d: DB, op: QueuedOp, extra: Pick<Ctx, 'approve'> = {}) {
  const def = OPS[op.name] as Def<OpName>
  if (!def) throw new OpError('Unknown change type')
  const args = validate(op.name, op.args)
  def.run(d, args, { opId: op.id, staffId: op.staffId, at: op.at, ...extra })
  if (def.audit) {
    const [action, detail] = def.audit(d, args)
    d.audit.unshift({ id: op.id, at: op.at, staffId: op.staffId, action, detail })
  }
}
export const OP_NAMES = Object.keys(OPS) as OpName[]

/** Why this person may not make this change, or null when they may. Checked by the app and again by the server. */
export function denied(d: DB, staff: Staff | undefined, name: string): string | null {
  if (!staff || !staff.active) return 'Please log in again'
  const def = (OPS as Record<string, Def<OpName>>)[name]
  if (!def) return 'Unknown change type'
  if (staff.role === 'owner') return null
  if (def.ownerOnly) return 'Only the owner can do this'
  if (readOnly(staff.role)) return 'Accountants have read-only access'
  if (!def.pages.some(p => canSee(d, staff.role, p))) return `Your role (${staff.role}) does not have access to this`
  return null
}
