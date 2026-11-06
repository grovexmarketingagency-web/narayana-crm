import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Pause, Trash2, ScanLine, UserPlus, X, CreditCard, Search } from 'lucide-react'
import { useStore, api, currentStaff } from '../lib/store'
import { computeDraft } from '../lib/calc'
import { inr, inr2, r2 } from '../lib/format'
import { go } from '../lib/router'
import { Button, Input, Select, Field, Modal, Badge, PinPad, toast } from '../components/ui'
import type { Payment, PayMode, Variant } from '../lib/types'

export default function Billing() {
  const { db } = useStore()
  const me = currentStaff()!
  const open = db.drafts.filter(d => !d.held)
  const held = db.drafts.filter(d => d.held)
  const [activeId, setActive] = useState<string>(open[0]?.id || '')
  useEffect(() => { if (!db.drafts.find(d => d.id === activeId && !d.held)) { const o = db.drafts.find(d => !d.held); setActive(o ? o.id : api.newDraft()) } }, [db.drafts, activeId])
  const draft = db.drafts.find(d => d.id === activeId)
  const c = useMemo(() => (draft ? computeDraft(db, draft) : null), [db, draft])
  const scanRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [metreFor, setMetreFor] = useState<Variant | null>(null)
  const [metreQty, setMetreQty] = useState('1')
  const [payOpen, setPayOpen] = useState(false)
  const [custOpen, setCustOpen] = useState(false)

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'F2') { e.preventDefault(); scanRef.current?.focus() } if (e.key === 'F9') { e.preventDefault(); if (c?.lines.length) setPayOpen(true) } }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  if (!draft || !c) return null

  const productOf = (v: Variant) => db.products.find(p => p.id === v.productId)!
  const results = q.trim().length >= 2 ? db.variants.filter(v => {
    const p = productOf(v); const s = q.toLowerCase()
    return v.barcode.toLowerCase().includes(s) || p.name.toLowerCase().includes(s) || `${v.size} ${v.colour}`.toLowerCase().includes(s)
  }).slice(0, 8) : []

  function add(v: Variant) {
    const p = productOf(v)
    if (p.unit === 'm') { setMetreFor(v); setMetreQty('1') } else { if (v.stock < 1) toast.err(`${p.name} ${v.size} is out of stock`); api.addToDraft(draft!.id, v.id, 1) }
    setQ(''); scanRef.current?.focus()
  }
  function onScan(e: React.FormEvent) {
    e.preventDefault(); const code = q.trim(); if (!code) return
    const sm = db.salesmen.find(s => s.active && s.code.toUpperCase() === code.toUpperCase())
    if (sm) { api.updateDraft(draft!.id, d => { d.salesmanId = sm.id }); toast.ok(`Salesman: ${sm.name}`); setQ(''); return }
    const v = db.variants.find(x => x.barcode.toUpperCase() === code.toUpperCase())
    if (v) return add(v)
    if (results.length === 1) return add(results[0])
    if (!results.length) toast.err(`No item with code "${code}"`)
  }
  const cust = db.customers.find(x => x.id === draft.customerId)
  const discPct = c.gross ? ((c.gross - c.total) / c.gross) * 100 : 0

  return <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
    <div className="min-w-0">
      {/* bill tabs */}
      <div className="mb-3 flex flex-wrap items-center gap-2" role="tablist" aria-label="Open bills">
        {open.map(d => <button key={d.id} role="tab" aria-selected={d.id === activeId} onClick={() => setActive(d.id)}
          className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm ${d.id === activeId ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface hover:bg-surface-2'}`}>
          {d.label}{d.lines.length > 0 && <span className="rounded-full bg-black/10 px-1.5 text-xs">{d.lines.length}</span>}</button>)}
        <Button size="sm" variant="ghost" onClick={() => setActive(api.newDraft())}><Plus size={15} />Next customer</Button>
        {held.length > 0 && <div className="ml-auto flex flex-wrap items-center gap-2"><span className="text-xs text-muted">On hold:</span>{held.map(h =>
          <button key={h.id} onClick={() => { api.updateDraft(h.id, d => { d.held = false }); setActive(h.id) }} className="h-8 rounded-md border border-dashed border-gold px-2.5 text-xs text-gold hover:bg-gold/10">
            {h.label} · {db.customers.find(x => x.id === h.customerId)?.name || `${h.lines.length} items`}</button>)}</div>}
      </div>

      {/* scan */}
      <form onSubmit={onScan} className="relative mb-3">
        <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={20} />
        <input ref={scanRef} autoFocus value={q} onChange={e => setQ(e.target.value)} aria-label="Scan or search item"
          placeholder="Scan QR / barcode, type item name, or scan a salesman card (F2)"
          className="h-14 w-full rounded-lg border-2 border-border bg-surface pl-11 pr-4 text-base focus:border-accent focus:outline-none" />
        {results.length > 0 && <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg" role="listbox">
          {results.map(v => { const p = productOf(v); return <li key={v.id}><button type="button" onClick={() => add(v)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-2">
            <span><span className="font-medium">{p.name}</span> <span className="text-muted">{[v.size, v.colour].filter(Boolean).join(' / ')}</span><span className="ml-2 text-xs text-muted">{v.barcode}</span></span>
            <span className="flex items-center gap-3"><Badge tone={v.stock <= 0 ? 'danger' : v.stock <= v.lowAt ? 'warning' : 'neutral'}>{v.stock} {p.unit === 'm' ? 'm' : 'pcs'}</Badge><span className="num font-medium">{inr(v.mrp)}{p.unit === 'm' ? '/m' : ''}</span></span>
          </button></li> })}</ul>}
      </form>

      {/* cart */}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th className="px-3 py-2">Item</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Disc ₹</th><th className="px-3 py-2 text-right">GST</th><th className="px-3 py-2 text-right">Amount</th><th /></tr></thead>
          <tbody className="divide-y divide-border">
            {draft.lines.length === 0 && <tr><td colSpan={7} className="px-4 py-16 text-center text-muted"><ScanLine className="mx-auto mb-2" />Scan the first item to start this bill.</td></tr>}
            {draft.lines.map((l, i) => { const line = c.lines[i]; const v = db.variants.find(x => x.id === l.variantId)!; const p = productOf(v); return <tr key={l.variantId}>
              <td className="px-3 py-2"><div className="font-medium">{p.name}</div><div className="text-xs text-muted">{[v.size, v.colour].filter(Boolean).join(' / ')} · {v.barcode} · HSN {p.hsn}</div></td>
              <td className="px-3 py-2"><div className="flex items-center gap-1"><input type="number" min={p.unit === 'm' ? 0.1 : 1} step={p.unit === 'm' ? 0.25 : 1} value={l.qty} aria-label="Quantity"
                onChange={e => api.updateDraft(draft.id, d => { d.lines[i].qty = Math.max(0, +e.target.value) })} className="h-9 w-20 rounded border border-border bg-surface px-2 num" /><span className="text-xs text-muted">{p.unit === 'm' ? 'm' : ''}</span></div></td>
              <td className="num px-3 py-2 text-right">{inr2(v.mrp)}</td>
              <td className="px-3 py-2 text-right"><input type="number" min={0} value={l.discount || ''} placeholder="0" aria-label="Line discount"
                onChange={e => api.updateDraft(draft.id, d => { d.lines[i].discount = Math.max(0, +e.target.value) })} className="h-9 w-20 rounded border border-border bg-surface px-2 text-right num" /></td>
              <td className="px-3 py-2 text-right"><Badge tone={line?.gstRate > 5 ? 'warning' : 'neutral'}>{line?.gstRate}%</Badge></td>
              <td className="num px-3 py-2 text-right font-medium">{inr2(line?.net || 0)}</td>
              <td className="px-2"><button aria-label="Remove item" onClick={() => api.updateDraft(draft.id, d => { d.lines.splice(i, 1) })} className="rounded p-1.5 text-muted hover:bg-danger/10 hover:text-danger"><Trash2 size={16} /></button></td>
            </tr> })}
          </tbody>
        </table>
      </div>
      {c.errors.length > 0 && <div role="alert" className="mt-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{c.errors.join(' · ')}</div>}
      <p className="mt-2 text-xs text-muted">Shortcuts: F2 scan · F9 pay. Garments above {inr(db.shop.garmentThreshold)} per piece (after discount) take {db.shop.garmentHigh}% GST, others {db.shop.garmentLow}%; fabric {db.shop.fabricRate}%.</p>
    </div>

    {/* right panel */}
    <aside className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">Customer</span>{cust && <button className="text-xs text-muted hover:text-danger" onClick={() => api.updateDraft(draft.id, d => { d.customerId = undefined })}>Remove</button>}</div>
        {cust ? <div className="text-sm"><div className="font-medium">{cust.name}</div><div className="text-muted">{cust.mobile}</div>
          <div className="mt-2 flex flex-wrap gap-2"><Badge tone="accent">{cust.points} points</Badge>{cust.balance > 0 && <Badge tone="danger">Due {inr(cust.balance)}</Badge>}</div></div>
          : <Button className="w-full" onClick={() => setCustOpen(true)}><UserPlus size={16} />Add customer by mobile</Button>}
        <Field label="Salesman" className="mt-3"><Select value={draft.salesmanId || ''} onChange={e => api.updateDraft(draft.id, d => { d.salesmanId = e.target.value || undefined })}>
          <option value="">None</option>{db.salesmen.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</Select></Field>
      </div>
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="Bill discount"><Input type="number" min={0} value={draft.billDiscount.value || ''} placeholder="0" onChange={e => api.updateDraft(draft.id, d => { d.billDiscount.value = Math.max(0, +e.target.value) })} /></Field>
          <Field label="Type"><Select value={draft.billDiscount.type} onChange={e => api.updateDraft(draft.id, d => { d.billDiscount.type = e.target.value as 'pct' | 'amt' })}><option value="pct">%</option><option value="amt">₹</option></Select></Field>
        </div>
        <Field label="Coupon code" className="mt-2"><Input value={draft.couponCode} placeholder="e.g. WELCOME5" onChange={e => api.updateDraft(draft.id, d => { d.couponCode = e.target.value.toUpperCase() })} /></Field>
        {c.couponMsg && <div className="mt-1 text-xs text-danger">{c.couponMsg}</div>}
        <dl className="mt-4 space-y-1.5 text-sm">
          <Row k={`Items (${r2(c.pieces)})`} v={inr2(c.gross)} />
          {c.lineDiscount > 0 && <Row k="Item discounts" v={'− ' + inr2(c.lineDiscount)} />}
          {c.offerDiscount > 0 && <Row k={<span className="text-success">{c.offerLabel}</span>} v={<span className="text-success">− {inr2(c.offerDiscount)}</span>} />}
          {c.billDiscount > 0 && <Row k="Bill discount" v={'− ' + inr2(c.billDiscount)} />}
          <Row k="Taxable value" v={inr2(c.taxable)} muted />
          <Row k="CGST" v={inr2(c.tax / 2)} muted /><Row k="SGST" v={inr2(c.tax / 2)} muted />
          {c.roundOff !== 0 && <Row k="Round off" v={inr2(c.roundOff)} muted />}
        </dl>
        <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3"><span className="font-semibold">Total</span><span className="num font-display text-3xl font-semibold text-accent">{inr(c.total)}</span></div>
        {discPct > me.maxDiscountPct && <p className="mt-1 text-xs text-warning">Discount {r2(discPct)}% is above your limit ({me.maxDiscountPct}%). Owner PIN needed.</p>}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button variant="secondary" disabled={!draft.lines.length} onClick={() => { api.updateDraft(draft.id, d => { d.held = true }); toast.ok(`${draft.label} put on hold`) }}><Pause size={16} />Hold</Button>
          <Button variant="ghost" onClick={() => { if (!draft.lines.length || confirmClear()) api.removeDraft(draft.id) }}><X size={16} />Clear</Button>
          <Button variant="primary" size="md" disabled={!draft.lines.length || c.errors.length > 0} onClick={() => setPayOpen(true)}><CreditCard size={16} />Pay</Button>
        </div>
      </div>
    </aside>

    <Modal open={!!metreFor} onClose={() => setMetreFor(null)} title={metreFor ? `${productOf(metreFor).name} ${metreFor.colour}` : ''}
      footer={<><Button onClick={() => setMetreFor(null)}>Cancel</Button><Button variant="primary" onClick={() => { const n = +metreQty; if (n > 0) api.addToDraft(draft.id, metreFor!.id, n); setMetreFor(null); scanRef.current?.focus() }}>Add {metreQty} m</Button></>}>
      <Field label="Length in metres" hint={metreFor ? `${inr(metreFor.mrp)} per metre · ${metreFor.stock} m in stock` : ''}>
        <Input type="number" step="0.25" min="0.1" value={metreQty} onChange={e => setMetreQty(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { const n = +metreQty; if (n > 0) api.addToDraft(draft.id, metreFor!.id, n); setMetreFor(null) } }} /></Field>
      <div className="mt-3 flex flex-wrap gap-2">{[1, 1.5, 2, 2.25, 2.5, 3, 5].map(n => <Button key={n} size="sm" onClick={() => setMetreQty(String(n))}>{n} m</Button>)}</div>
    </Modal>
    <CustomerPicker open={custOpen} onClose={() => setCustOpen(false)} onPick={id => { api.updateDraft(draft.id, d => { d.customerId = id }); setCustOpen(false) }} />
    {payOpen && <PayModal draftId={draft.id} total={c.total} needsPin={discPct > me.maxDiscountPct} customerId={draft.customerId} onClose={() => setPayOpen(false)} />}
  </div>
}
const confirmClear = () => true
function Row({ k, v, muted }: { k: React.ReactNode; v: React.ReactNode; muted?: boolean }) {
  return <div className={`flex justify-between ${muted ? 'text-muted' : ''}`}><dt>{k}</dt><dd className="num">{v}</dd></div>
}

export function CustomerPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const { db } = useStore()
  const [m, setM] = useState(''); const [name, setName] = useState('')
  useEffect(() => { if (open) { setM(''); setName('') } }, [open])
  const matches = m.length >= 3 ? db.customers.filter(c => c.mobile.includes(m) || c.name.toLowerCase().includes(m.toLowerCase())).slice(0, 6) : []
  const valid = /^\d{10}$/.test(m)
  const exact = db.customers.find(c => c.mobile === m)
  return <Modal open={open} onClose={onClose} title="Customer">
    <Field label="Mobile number or name"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-muted" /><Input className="pl-9" inputMode="tel" value={m} onChange={e => setM(e.target.value.trim())} placeholder="10-digit mobile" /></div></Field>
    <ul className="mt-3 divide-y divide-border">{matches.map(c => <li key={c.id}><button onClick={() => onPick(c.id)} className="flex w-full justify-between px-1 py-2.5 text-left text-sm hover:bg-surface-2">
      <span><span className="font-medium">{c.name}</span> <span className="text-muted">{c.mobile}</span></span><span className="text-xs text-muted">{c.points} pts</span></button></li>)}</ul>
    {valid && !exact && <div className="mt-4 rounded-md border border-dashed border-border p-3">
      <div className="mb-2 text-sm font-medium">New customer · {m}</div>
      <div className="flex gap-2"><Input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        <Button variant="primary" disabled={!name.trim()} onClick={() => onPick(api.upsertCustomer({ mobile: m, name: name.trim() }))}>Save</Button></div></div>}
  </Modal>
}

function PayModal({ draftId, total, needsPin, customerId, onClose }: { draftId: string; total: number; needsPin: boolean; customerId?: string; onClose: () => void }) {
  const { db } = useStore()
  const cust = db.customers.find(c => c.id === customerId)
  const [approved, setApproved] = useState(!needsPin)
  const [approval, setApproval] = useState<string | undefined>()
  const [pinErr, setPinErr] = useState('')
  const [rows, setRows] = useState<Payment[]>([{ mode: 'cash', amount: total }])
  const [tendered, setTendered] = useState('')
  const sum = r2(rows.reduce((s, r) => s + (+r.amount || 0), 0))
  const left = r2(total - sum)
  const modes: { id: PayMode; label: string }[] = [{ id: 'cash', label: 'Cash' }, { id: 'upi', label: 'UPI' }, { id: 'card', label: 'Card' }, { id: 'credit', label: 'Credit (pay later)' }, { id: 'voucher', label: 'Voucher / credit note' }, { id: 'points', label: 'Loyalty points' }]
  const cash = rows.filter(r => r.mode === 'cash').reduce((s, r) => s + r.amount, 0)
  function finish() {
    const res = api.checkout(draftId, rows.map(r => ({ ...r, amount: +r.amount || 0 })), approval)
    if (!res.ok) return toast.err(res.error)
    toast.ok(`Bill ${res.bill.no} saved`); onClose(); go('/bills/' + res.bill.id)
  }
  if (!approved) return <Modal open onClose={onClose} title="Owner approval needed"><PinPad label="Owner, enter your PIN to approve this discount" error={pinErr} onSubmit={async p => { setPinErr('Checking…'); const r = await api.approveDiscount(draftId, p); if (r.ok) { setApproval(r.approval); setApproved(true) } else setPinErr(r.error) }} /></Modal>
  return <Modal open onClose={onClose} title={`Take payment · ${inr(total)}`} footer={<><Button onClick={onClose}>Back</Button><Button variant="primary" disabled={Math.abs(left) > 0.5} onClick={finish}>Save & print bill</Button></>}>
    <div className="mb-3 flex flex-wrap gap-2">{(['cash', 'upi', 'card'] as PayMode[]).map(m => <Button key={m} size="sm" onClick={() => setRows([{ mode: m, amount: total }])}>All {m.toUpperCase()}</Button>)}</div>
    <div className="space-y-2">{rows.map((r, i) => <div key={i} className="grid grid-cols-[1fr_120px_auto] items-end gap-2">
      <Field label={i === 0 ? 'Mode' : ''}><Select value={r.mode} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, mode: e.target.value as PayMode } : x))}>{modes.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
      <Field label={i === 0 ? 'Amount' : ''}><Input type="number" value={r.amount || ''} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, amount: +e.target.value } : x))} /></Field>
      <button aria-label="Remove payment" className="mb-2 rounded p-1 text-muted hover:text-danger" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}><X size={16} /></button>
      {r.mode === 'voucher' && <Input className="col-span-2" placeholder="Voucher or credit note code" value={r.ref || ''} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, ref: e.target.value.toUpperCase() } : x))} />}
      {r.mode === 'credit' && <p className="col-span-3 text-xs text-muted">{cust ? `${cust.name}: due ${inr(cust.balance)}, limit ${inr(cust.creditLimit)}` : 'Pick a customer on the bill first.'}</p>}
      {r.mode === 'points' && <p className="col-span-3 text-xs text-muted">{cust ? `${cust.points} points available (1 point = ${inr(db.shop.pointValue)})` : 'Pick a customer on the bill first.'}</p>}
    </div>)}</div>
    <Button size="sm" variant="ghost" className="mt-2" disabled={left <= 0} onClick={() => setRows(rs => [...rs, { mode: 'upi', amount: left }])}><Plus size={14} />Split: add {inr(left)}</Button>
    <div className={`mt-3 text-sm ${Math.abs(left) > 0.5 ? 'text-danger' : 'text-success'}`}>{Math.abs(left) > 0.5 ? (left > 0 ? `${inr(left)} still to collect` : `${inr(-left)} more than the bill`) : 'Payments match the bill'}</div>
    {cash > 0 && <div className="mt-4 grid grid-cols-2 gap-3 rounded-md bg-surface-2 p-3">
      <Field label="Cash given"><Input type="number" value={tendered} onChange={e => setTendered(e.target.value)} placeholder={String(cash)} /></Field>
      <div><div className="text-sm font-medium text-muted">Change to return</div><div className="num mt-2 text-xl font-semibold">{inr(Math.max(0, (+tendered || cash) - cash))}</div></div></div>}
  </Modal>
}
