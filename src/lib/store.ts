import { useSyncExternalStore } from 'react'
import { produce, setAutoFreeze } from 'immer'
import type { DB, Draft, PayMode, Payment, Bill, Staff, Purchase, Expense, Alteration, Offer, Customer, Product, Variant, Salesman, Supplier, Income, SupplierPayment, Role, AcctMode } from './types'
import { buildSeed } from './seed'
import { migrate } from './migrate'
import { computeDraft } from './calc'
import { uid, r2 } from './format'
import { applyOp, denied, OpError, type QueuedOp } from './ops'
import type { OpName, Args } from './schemas'
import { applyChanges, fromChanges, type Change, type Seqs } from './sync'
import { getMany, setMany, keepData } from './persist'

setAutoFreeze(false)

/* Data layer for every screen.

   Each change is an operation with its own id (see ops.ts). It is applied on this counter straight away and
   written to IndexedDB in the same moment, so a bill is never lost to a reload, crash or power cut.

   'local' mode  (no central server, or the file opened directly): operations are folded into this
                 counter's own copy of the data.
   'server' mode (opened from the central database server): operations wait in a saved queue until the
                 server accepts them. The server re-checks permissions, recalculates prices and GST, and
                 applies each operation id exactly once, so retries after a network drop never double a bill.
                 What the screens show = the server's copy + this counter's waiting operations. */

export type SyncState = { mode: 'local' | 'server'; status: 'synced' | 'pending' | 'offline' | 'local'; pending: number; lastSync?: string; server?: string; error?: string }
type Me = Pick<Staff, 'id' | 'name' | 'role' | 'maxDiscountPct' | 'active'>
type PublicStaff = { id: string; name: string; role: Role }

let mode: 'local' | 'server' = 'local'
let ready = false
let base: DB = buildSeed()      // local: the data itself. server: the server's confirmed copy
let seqs: Seqs = {}
let version = 0, resetAt = 0, serverId = ''
let queue: QueuedOp[] = []
let drafts: Draft[] = []
let applied: DB = base          // base + queue
let db: DB = base               // applied + this counter's drafts
let me: Me | null = null        // who is logged in
let loginStaff: PublicStaff[] = []
let sync: SyncState = { mode: 'local', status: 'local', pending: 0 }
const subs = new Set<() => void>()
const rejectListeners = new Set<(msg: string) => void>()

let snapshot = { db, session: null as string | null, sync, ready, loginStaff, hasData: true, shopName: '' }
function emit() {
  db = { ...applied, drafts }
  snapshot = { db, session: me?.id ?? null, sync, ready, loginStaff, hasData: mode === 'local' || version > 0, shopName: applied.shop?.name || serverName }
  subs.forEach(f => f())
}
function setSync(p: Partial<SyncState>) { sync = { ...sync, ...p, pending: queue.length }; emit() }
const say = (msg: string) => rejectListeners.forEach(f => f(msg))
export function onSyncError(f: (msg: string) => void) { rejectListeners.add(f); return () => { rejectListeners.delete(f) } }

/* ---------- saving on this counter ---------- */
const P = () => (mode === 'local' ? 'L:' : 'S:')
let saveTimer: ReturnType<typeof setTimeout> | undefined
let draftTimer: ReturnType<typeof setTimeout> | undefined
/** the waiting operations are saved immediately, together with nothing else, so the write is small and fast */
const saveQueue = () => setMany({ [P() + 'queue']: queue })
/** the full copy is saved a moment later (it is large); in local mode this also folds the queue into it */
function scheduleBaseSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (mode === 'local') { base = applied; const done = queue.length; void setMany({ 'L:base': base, 'L:queue': [] }).then(() => { queue = queue.slice(done); if (queue.length) void saveQueue() }) }
    else void setMany({ 'S:base': { base, seqs, version, resetAt, serverId } })
  }, mode === 'local' ? 400 : 1500)
}
function scheduleDraftSave() { clearTimeout(draftTimer); draftTimer = setTimeout(() => void setMany({ [P() + 'drafts']: drafts, [P() + 'me']: me }), 300) }

function replay() {
  let cur = base
  for (const op of queue) { try { cur = produce(cur, d => applyOp(d, op)) } catch { /* the server will refuse it and say why */ } }
  applied = cur
}

/** loads this counter's saved data, then looks for the central database server */
export async function start() {
  void keepData()
  const server = typeof location !== 'undefined' && /^https?:$/.test(location.protocol) ? await hello() : null
  const s = await getMany(['S:base', 'S:queue', 'S:drafts', 'S:me', 'L:base', 'L:queue', 'L:drafts', 'L:me'])
  const hadServer = !!s['S:base']
  if (server || hadServer) {
    mode = 'server'
    const sb = s['S:base'] as { base: DB; seqs: Seqs; version: number; resetAt: number; serverId: string } | undefined
    if (sb && (!server || sb.serverId === server.serverId)) { base = migrate(sb.base); seqs = sb.seqs; version = sb.version; resetAt = sb.resetAt; serverId = sb.serverId }
    else { base = fromChanges([]).db; seqs = {}; version = 0; resetAt = 0; serverId = server?.serverId || '' }
    queue = (s['S:queue'] as QueuedOp[]) || []; drafts = (s['S:drafts'] as Draft[]) || []; me = (s['S:me'] as Me) || null
    if (server) { loginStaff = server.staff; serverName = server.name }
    sync = { mode: 'server', status: server ? 'synced' : 'offline', pending: queue.length, server: serverName || location.host }
    replay(); ready = true; emit()
    if (server) { await checkSession(); await syncNow() }
    setInterval(() => void syncNow(), 4000)
    window.addEventListener('online', () => void syncNow())
  } else {
    mode = 'local'
    const legacy = (() => { try { const raw = localStorage.getItem('narayana-crm-db-v1'); return raw ? JSON.parse(raw) as DB : null } catch { return null } })()
    const saved = (s['L:base'] as DB) || legacy
    base = saved ? migrate(saved) : buildSeed()
    queue = (s['L:queue'] as QueuedOp[]) || []
    drafts = (s['L:drafts'] as Draft[]) || base.drafts || []
    base = { ...base, drafts: [] }
    me = (s['L:me'] as Me) || (() => { try { const id = sessionStorage.getItem('narayana-crm-session'); const st = id && base.staff.find(x => x.id === id); return st ? toMe(st) : null } catch { return null } })()
    replay(); ready = true; emit()
    if (queue.length || !s['L:base']) scheduleBaseSave()
  }
}
let serverName = ''
const toMe = (s: Staff): Me => ({ id: s.id, name: s.name, role: s.role, maxDiscountPct: s.maxDiscountPct, active: s.active })

/* ---------- talking to the central database ---------- */
const API = './api'
class HttpErr extends Error { constructor(public status: number, msg: string) { super(msg) } }
async function req<T>(path: string, init: RequestInit = {}, ms = 8000): Promise<T> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms)
  try {
    const r = await fetch(API + path, { ...init, signal: c.signal, credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-narayana': '1', ...(init.headers || {}) } })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) throw new HttpErr(r.status, (body as { error?: string }).error || 'Server error ' + r.status)
    return body as T
  } finally { clearTimeout(t) }
}
async function hello() {
  try { const h = await req<{ app: string; name: string; serverId: string; staff: PublicStaff[] }>('/hello', {}, 2500); return h.app === 'narayana-crm' ? h : null } catch { return null }
}
async function checkSession() {
  try { const r = await req<{ staff: Me }>('/me'); me = r.staff; scheduleDraftSave(); emit() }
  catch (e) { if (e instanceof HttpErr && e.status === 401) { me = null; scheduleDraftSave(); emit() } }
}
type Pull = { version: number; resetAt: number; serverId: string; full: boolean; changes: Change[] }
function takeChanges(p: Pull) {
  if (p.full || p.serverId !== serverId) { const f = fromChanges(p.changes); base = f.db; seqs = f.seqs }
  else if (p.changes.length) base = produce(base, d => { applyChanges(d, seqs, p.changes) })
  if (p.full) base = migrate(base)
  const changed = p.full || p.changes.length > 0
  version = p.version; resetAt = p.resetAt; serverId = p.serverId
  if (changed) { replay(); scheduleBaseSave() }
  return changed
}
let syncing = false
export async function syncNow(): Promise<void> {
  if (mode !== 'server' || syncing || !me) return
  syncing = true
  try {
    if (!queue.length) takeChanges(await req<Pull>('/changes?since=' + version))
    for (let round = 0; queue.length && round < 50; round++) {
      const batch = queue.slice(0, 100)
      const r = await req<Pull & { results: { id: string; ok: boolean; error?: string; retry?: boolean }[] }>('/ops', { method: 'POST', body: JSON.stringify({ ops: batch, since: version }) }, 20000)
      const done = new Set<string>()
      for (const x of r.results) {
        if (x.retry) continue
        done.add(x.id)
        if (!x.ok) { const op = batch.find(o => o.id === x.id); say(`The central database refused a change${op ? ` (${label(op)})` : ''}: ${x.error}`) }
      }
      queue = queue.filter(o => !done.has(o.id)); await saveQueue()
      takeChanges(r); replay()
      if (!done.size) break          // the server asked us to try these again later
    }
    setSync({ status: queue.length ? 'pending' : 'synced', lastSync: new Date().toISOString(), error: undefined })
  } catch (e) {
    if (e instanceof HttpErr && e.status === 401) { me = null; scheduleDraftSave(); setSync({ status: 'offline', error: 'Logged out by the server' }) }
    else setSync({ status: 'offline', error: e instanceof Error ? e.message : String(e) })
  } finally { syncing = false }
}
const label = (op: QueuedOp) => op.name === 'checkout' ? 'a bill' : op.name.replace(/([A-Z])/g, ' $1').toLowerCase()

export const serverApi = {
  listBackups: async () => (await req<{ name: string; size: number; at: string }[]>('/backups')).map(b => ({ file: b.name, size: b.size, at: b.at })),
  backupNow: async () => { try { await req('/backups', { method: 'POST', body: '{}' }); return true } catch { return false } },
  backupUrl: (file: string) => `${API}/backups/${encodeURIComponent(file)}`,
  exportUrl: () => `${API}/export`,
}

/* ---------- reading ---------- */
export function useStore() { return useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f) }, () => snapshot) }
export const getDB = () => db
export function currentStaff(): Staff | undefined {
  if (!me) return undefined
  return db.staff.find(s => s.id === me!.id) || (me as Staff)
}
/** true while a bill made on this counter is still waiting for the central database (its number may change) */
export const isPending = (billId: string) => queue.some(o => o.name === 'checkout' && (o.args as Args<'checkout'>).billId === billId)
const variantName = (d: DB, vid: string) => { const v = d.variants.find(x => x.id === vid); const p = v && d.products.find(x => x.id === v.productId); return p ? `${p.name} ${[v!.size, v!.colour].filter(Boolean).join('/')}` : vid }

/* ---------- changing ---------- */
/** applies one operation here and queues it for the server. Returns false (and shows why) if it is not allowed. */
function run<N extends OpName>(name: N, args: Args<N>, opts: { quiet?: boolean } = {}): boolean {
  const staff = currentStaff()
  const why = denied(applied, staff, name)
  if (why) { if (!opts.quiet) say(why); return false }
  const op: QueuedOp = { id: uid() + uid(), name, args, staffId: staff!.id, at: new Date().toISOString() }
  try { applied = produce(applied, d => applyOp(d, op)) }
  catch (e) { if (!opts.quiet) say(e instanceof OpError ? e.message : 'Could not save: ' + String(e)); return false }
  queue.push(op)
  void saveQueue()
  if (mode === 'server') { setSync({ status: 'pending' }); void syncNow() } else { scheduleBaseSave(); emit() }
  return true
}
function setDrafts(fn: (d: Draft[]) => Draft[]) { drafts = fn(drafts); scheduleDraftSave(); emit() }

export const api = {
  /* session */
  async login(staffId: string, pin: string): Promise<true | string> {
    if (mode === 'server') {
      try { const r = await req<{ staff: Me }>('/login', { method: 'POST', body: JSON.stringify({ staffId, pin }) }); me = r.staff; await setMany({ 'S:me': me }); emit(); void syncNow(); return true }
      catch (e) { return e instanceof HttpErr ? e.message : 'The central database is not reachable. Check the shop network.' }
    }
    const s = base.staff.find(x => x.id === staffId && x.active)
    if (!s || s.pin !== pin) return 'That PIN did not match. Try again.'
    me = toMe(s); try { sessionStorage.setItem('narayana-crm-session', s.id) } catch { /* */ }
    base = produce(base, d => { d.audit.unshift({ id: uid(), at: new Date().toISOString(), staffId: s.id, action: 'login', detail: s.name }) }); replay()
    scheduleBaseSave(); scheduleDraftSave(); emit(); return true
  },
  logout() {
    if (mode === 'server') void syncNow().finally(() => req('/logout', { method: 'POST', body: '{}' }).catch(() => undefined))
    me = null; try { sessionStorage.removeItem('narayana-crm-session') } catch { /* */ }
    void setMany({ [P() + 'me']: null }); emit()
  },
  /** owner approval for a discount above the cashier's limit. Returns an approval to attach to the bill, or an error. */
  async approveDiscount(billId: string, pin: string): Promise<{ ok: true; approval: string } | { ok: false; error: string }> {
    if (mode === 'server') {
      try { const r = await req<{ token: string }>('/approve', { method: 'POST', body: JSON.stringify({ billId, pin }) }); return { ok: true, approval: r.token } }
      catch (e) { return { ok: false, error: e instanceof HttpErr ? e.message : 'Owner approval needs the central database. Check the network.' } }
    }
    return base.staff.some(s => s.active && s.role === 'owner' && s.pin === pin) ? { ok: true, approval: 'local' } : { ok: false, error: 'Wrong PIN' }
  },

  /* drafts (stay on this counter) */
  newDraft(): string {
    const id = uid()
    setDrafts(ds => [...ds, { id, label: `Bill ${ds.length + 1}`, lines: [], billDiscount: { type: 'pct', value: 0 }, couponCode: '', held: false, createdAt: new Date().toISOString() }])
    return id
  },
  updateDraft(id: string, fn: (dr: Draft) => void) { setDrafts(ds => produce(ds, d => { const dr = d.find(x => x.id === id); if (dr) fn(dr) })) },
  removeDraft(id: string) { setDrafts(ds => ds.filter(x => x.id !== id)) },
  addToDraft(id: string, variantId: string, qty = 1) {
    api.updateDraft(id, dr => { const l = dr.lines.find(x => x.variantId === variantId); if (l) l.qty = r2(l.qty + qty); else dr.lines.push({ variantId, qty, discount: 0 }) })
  },

  /* checkout: the draft id becomes the bill id, so an owner approval is tied to this one bill */
  checkout(draftId: string, payments: Payment[], approval?: string): { ok: true; bill: Bill } | { ok: false; error: string } {
    const dr = drafts.find(x => x.id === draftId); if (!dr) return { ok: false, error: 'Bill not found' }
    const c = computeDraft(db, dr)
    if (!c.lines.length) return { ok: false, error: 'Add at least one item' }
    if (c.errors.length) return { ok: false, error: c.errors[0] }
    const paid = r2(payments.reduce((s, p) => s + p.amount, 0))
    if (Math.abs(paid - c.total) > 0.5) return { ok: false, error: `Payments (${paid}) must equal total (${c.total})` }
    const cust = db.customers.find(x => x.id === dr.customerId)
    const credit = payments.filter(p => p.mode === 'credit').reduce((s, p) => s + p.amount, 0)
    const pts = payments.filter(p => p.mode === 'points').reduce((s, p) => s + p.amount, 0)
    if ((credit || pts) && !cust) return { ok: false, error: 'Pick a customer for credit or points' }
    if (cust && credit && cust.balance + credit > cust.creditLimit) return { ok: false, error: `Credit limit ₹${cust.creditLimit} exceeded (due now ₹${cust.balance})` }
    const ptsNeeded = Math.ceil(pts / (db.shop.pointValue || 1))
    if (cust && ptsNeeded > cust.points) return { ok: false, error: `Customer has only ${cust.points} points` }
    for (const p of payments.filter(p => p.mode === 'voucher')) {
      const v = db.vouchers.find(x => x.code.toUpperCase() === (p.ref || '').toUpperCase())
      if (!v || v.balance < p.amount) return { ok: false, error: `Voucher ${p.ref} invalid or low balance` }
    }
    let err = ''
    const off = onSyncError(m => { err = m })
    const ok = run('checkout', { billId: draftId, lines: dr.lines, customerId: dr.customerId, salesmanId: dr.salesmanId, billDiscount: dr.billDiscount, couponCode: dr.couponCode,
      payments: payments.filter(p => p.amount > 0), approval: approval && approval !== 'local' ? approval : undefined })
    off()
    if (!ok) return { ok: false, error: err || 'Could not save the bill' }
    setDrafts(ds => ds.filter(x => x.id !== draftId))
    return { ok: true, bill: applied.bills.find(b => b.id === draftId)! }
  },

  /* customers & credit */
  upsertCustomer(c: Partial<Customer> & { mobile: string; name: string }): string {
    const id = c.id || uid()
    run('upsertCustomer', { id, mobile: c.mobile, name: c.name, creditLimit: c.creditLimit, birthday: c.birthday || undefined, city: c.city || undefined, isNew: !c.id })
    return id
  },
  collectCredit(customerId: string, amount: number, mode: PayMode) { run('collectCredit', { id: uid(), customerId, amount, mode }) },

  /* products */
  saveProduct(p: Product, vars: Variant[]) { return run('saveProduct', { product: p, variants: vars }) },
  deleteProduct(id: string) { run('deleteProduct', { id }) },
  importProducts(rows: { sku?: string; brand?: string; name: string; category: string; hsn: string; gstType: 'garment' | 'fabric' | 'other'; unit: 'pcs' | 'm'; size: string; colour: string; mrp: number; cost: number; stock: number; barcode?: string }[]) {
    // big files go in parts so each part stays well inside the server's size limit
    const clean = rows.map(r => ({ ...r, productId: uid(), variantId: uid(), gstType: r.gstType || 'garment', unit: r.unit || 'pcs', category: r.category || 'General', mrp: +r.mrp || 0, cost: +r.cost || 0, stock: +r.stock || 0, size: r.size || '', colour: r.colour || '', hsn: r.hsn || '' }))
    for (let i = 0; i < clean.length; i += 400) if (!run('importProducts', { rows: clean.slice(i, i + 400) })) return false
    return true
  },

  /* purchases & stock */
  addPurchase(p: Omit<Purchase, 'id' | 'no' | 'total'>, id = uid()) { return run('addPurchase', { id, supplierId: p.supplierId, invoiceNo: p.invoiceNo, at: p.at, lines: p.lines, paid: p.paid, payMode: p.payMode }) },
  startCount(category: string) { const id = uid(); run('startCount', { id, category }); return id },
  countScan(id: string, variantId: string, qty: number) { run('countScan', { id, variantId, qty }) },
  finishCount(id: string, apply: boolean) { run('finishCount', { id, apply }) },
  adjustStock(variantId: string, stock: number) { run('adjustStock', { variantId, stock }) },

  /* returns & vouchers */
  doReturn(billId: string, lines: { variantId: string; qty: number }[], refundMode: 'cash' | 'credit_note') {
    const id = uid()
    run('doReturn', { id, billId, lines, refundMode })
    const r = applied.returns.find(x => x.id === id)
    return { amount: r?.amount ?? 0, code: r?.voucherCode }
  },
  issueGiftVoucher(amount: number, customerId?: string, note?: string, mode: AcctMode = 'cash') {
    const id = uid()
    run('issueGiftVoucher', { id, amount, customerId, note, mode })
    return applied.vouchers.find(v => v.id === id)?.code ?? ''
  },

  /* alterations */
  saveAlteration(a: Partial<Alteration> & { customerName: string; item: string; dueDate: string }) { return run('saveAlteration', { alteration: a, newId: a.id ? undefined : uid() }) },

  /* offers, salesmen, suppliers, expenses, staff, shop */
  saveOffer(o: Offer) { return run('saveOffer', { offer: o }) },
  deleteOffer(id: string) { run('deleteOffer', { id }) },
  saveSalesman(m: Salesman) { return run('saveSalesman', { salesman: m }) },
  saveSupplier(s: Supplier) { return run('saveSupplier', { supplier: s }) },
  addExpense(e: Omit<Expense, 'id'>) { return run('addExpense', { ...e, id: uid() }) },
  deleteExpense(id: string) { run('deleteExpense', { id }) },
  saveStaff(s: Staff) { const { pinHash: _h, ...rest } = s; return run('saveStaff', { staff: { ...rest, pin: s.pin || undefined } }) },
  saveShop(s: DB['shop']) {
    // label and backup preferences can be changed by managers; everything else is owner-only
    const cur = applied.shop
    const prefsOnly = (Object.keys(s) as (keyof DB['shop'])[]).every(k => k === 'labelCode' || k === 'autoBackupHours' || s[k] === cur[k])
    if (prefsOnly) return run('setShopPrefs', { labelCode: s.labelCode, autoBackupHours: s.autoBackupHours })
    return run('saveShop', { shop: s })
  },

  /* accounts */
  addIncome(e: Omit<Income, 'id'>) { return run('addIncome', { ...e, id: uid() }) },
  deleteIncome(id: string) { run('deleteIncome', { id }) },
  paySupplier(p: Omit<SupplierPayment, 'id'>) { return run('paySupplier', { ...p, id: uid() }) },
  savePermissions(role: Role, pages: string[]) { run('savePermissions', { role, pages }) },

  /* backup */
  exportJSON() { return JSON.stringify({ ...db, drafts: [] }, null, 1) },
  async importJSON(text: string) {
    const parsed = JSON.parse(text) as DB
    if (!parsed.shop || !parsed.variants) throw new Error('Not a Narayana backup file')
    if (mode === 'server') {
      if (currentStaff()?.role !== 'owner') throw new Error('Only the owner can restore the central database')
      await syncNow()
      await req('/restore', { method: 'POST', body: JSON.stringify({ data: parsed }) }, 120000).catch(e => { throw new Error(e instanceof Error ? e.message : String(e)) })
      version = 0; await syncNow(); return
    }
    base = migrate({ ...structuredClone(parsed), drafts: [] }); queue = []
    replay(); await setMany({ 'L:base': base, 'L:queue': [] }); emit()
  },
  snapshot: () => db,
  resetDemo() {
    if (mode === 'server') { say('Reset to demo data is only for a single computer. Restore a backup on the central database instead.'); return }
    base = buildSeed(); base.drafts = []; queue = []; drafts = []
    replay(); void setMany({ 'L:base': base, 'L:queue': [], 'L:drafts': [] }); emit()
  },
}
export type Api = typeof api
export { variantName }
export const storeMode = () => mode
