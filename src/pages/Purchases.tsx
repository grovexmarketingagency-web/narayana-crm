import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useStore, api, currentStaff, variantName } from '../lib/store'
import { go } from '../lib/router'
import { uid } from '../lib/format'
import { Tag } from 'lucide-react'
import type { AcctMode } from '../lib/types'
import { inr, d, r2 } from '../lib/format'
import { readOnly } from '../lib/access'
import { Button, Card, Input, Select, Table, Td, PageHeader, Field, Modal, toast } from '../components/ui'
import { VariantSearch } from '../components/VariantSearch'
import type { PurchaseLine } from '../lib/types'

export default function Purchases() {
  const { db } = useStore(); const ro = readOnly(currentStaff()!.role)
  const [open, setOpen] = useState(false); const [sup, setSup] = useState(db.suppliers[0]?.id || ''); const [inv, setInv] = useState(''); const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<PurchaseLine[]>([]); const [paid, setPaid] = useState(''); const [mode, setMode] = useState<AcctMode>('bank')
  const total = r2(lines.reduce((s, l) => s + l.qty * l.cost, 0))
  return <>
    <PageHeader title="Purchases (stock inward)" sub="Record what suppliers deliver. Stock goes up and the cost price is used for profit." actions={!ro && <Button variant="primary" onClick={() => { setOpen(true); setLines([]); setInv(''); setPaid('') }}><Plus size={16} />New purchase</Button>} />
    <Card><Table head={['No.', 'Date', 'Supplier', 'Supplier invoice', 'Items', 'Total cost', 'Balance', '']} empty="No purchases recorded yet">
      {db.purchases.map(p => <tr key={p.id}><Td className="font-medium">{p.no}</Td><Td>{d(p.at)}</Td><Td>{db.suppliers.find(s => s.id === p.supplierId)?.name}</Td><Td>{p.invoiceNo}</Td>
        <Td className="max-w-xs truncate text-xs text-muted">{p.lines.map(l => `${variantName(db, l.variantId)} ×${l.qty}`).join(', ')}</Td><Td className="num font-medium">{inr(p.total)}</Td><Td className="num">{p.total - p.paid > 0 ? <span className="text-danger">{inr(p.total - p.paid)}</span> : <span className="text-success">Paid</span>}</Td>
        <Td><Button size="sm" variant="ghost" onClick={() => go('/labels?pur=' + p.id)}><Tag size={14} />Labels</Button></Td></tr>)}</Table></Card>
    <Modal open={open} onClose={() => setOpen(false)} wide title="New purchase" footer={<><span className="mr-auto self-center text-sm">Total cost <b className="num">{inr(total)}</b></span><Button onClick={() => setOpen(false)}>Cancel</Button>
      <Button variant="primary" disabled={!lines.length || !sup} onClick={() => { const id = uid(); api.addPurchase({ supplierId: sup, invoiceNo: inv, at: new Date(date + 'T12:00:00').toISOString(), lines: lines.filter(l => l.qty > 0), paid: paid === '' ? total : Math.max(0, +paid), payMode: mode }, id); toast.ok('Stock added'); setOpen(false); go('/labels?pur=' + id) }}>Save, add stock & print labels</Button></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Supplier"><Select value={sup} onChange={e => setSup(e.target.value)}>{db.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Supplier invoice no."><Input value={inv} onChange={e => setInv(e.target.value)} /></Field>
        <Field label="Date"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Amount paid now (₹)" hint="Leave empty if fully paid; 0 if on credit"><Input type="number" value={paid} placeholder={String(total)} onChange={e => setPaid(e.target.value)} /></Field>
        <Field label="Paid from"><Select value={mode} onChange={e => setMode(e.target.value as AcctMode)}><option value="bank">Bank / UPI</option><option value="cash">Cash</option></Select></Field>
      </div>
      <div className="mt-4"><VariantSearch onPick={v => setLines(ls => ls.some(l => l.variantId === v.id) ? ls.map(l => l.variantId === v.id ? { ...l, qty: l.qty + 1 } : l) : [...ls, { variantId: v.id, qty: 1, cost: v.cost }])} placeholder="Scan or search the item received" /></div>
      <table className="mt-3 w-full text-sm"><tbody className="divide-y divide-border">{lines.map((l, i) => <tr key={l.variantId}><td className="py-2">{variantName(db, l.variantId)}</td>
        <td className="py-2"><Input type="number" aria-label="Qty" className="h-9 w-24" value={l.qty} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, qty: +e.target.value } : x))} /></td>
        <td className="py-2"><Input type="number" aria-label="Cost each" className="h-9 w-28" value={l.cost} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, cost: +e.target.value } : x))} /></td>
        <td className="num py-2 text-right">{inr(l.qty * l.cost)}</td><td><button aria-label="Remove" className="p-1.5 text-muted hover:text-danger" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}><Trash2 size={15} /></button></td></tr>)}</tbody></table>
      {!lines.length && <p className="py-6 text-center text-sm text-muted">No items yet. New products? Add them in Products first, then receive them here.</p>}
    </Modal>
  </>
}
