import { useState } from 'react'
import { Gift, Search } from 'lucide-react'
import { useStore, api } from '../lib/store'
import { inr, dt, qtyFmt, r2 } from '../lib/format'
import { Button, Card, Input, Select, Table, Td, Badge, PageHeader, Field, Modal, Tabs, toast } from '../components/ui'

export default function Returns() {
  const { db } = useStore()
  const [tab, setTab] = useState<'return' | 'vouchers' | 'history'>('return')
  const [no, setNo] = useState(''); const [billId, setBillId] = useState<string | null>(null)
  const [qty, setQty] = useState<Record<string, number>>({}); const [mode, setMode] = useState<'credit_note' | 'cash'>('credit_note')
  const [gv, setGv] = useState(false); const [gvAmt, setGvAmt] = useState('1000'); const [gvNote, setGvNote] = useState('')
  const bill = db.bills.find(b => b.id === billId)
  const returnedQty = (vid: string) => db.returns.filter(r => r.billId === billId).reduce((s, r) => s + r.lines.filter(l => l.variantId === vid).reduce((x, l) => x + l.qty, 0), 0)
  const amount = bill ? Math.round(bill.lines.reduce((s, l) => s + (qty[l.variantId] || 0) * l.net / l.qty, 0)) : 0
  function find(e: React.FormEvent) { e.preventDefault(); const b = db.bills.find(x => x.no.toUpperCase() === no.trim().toUpperCase() || x.no.endsWith(no.trim().padStart(5, '0'))); if (!b) return toast.err('No bill with that number'); setBillId(b.id); setQty({}) }
  return <>
    <PageHeader title="Returns, exchanges & vouchers" sub="Take items back against a bill, give a credit note or refund, and sell gift vouchers" actions={<Button variant="primary" onClick={() => setGv(true)}><Gift size={16} />Sell gift voucher</Button>} />
    <Tabs value={tab} onChange={setTab} items={[{ id: 'return', label: 'New return' }, { id: 'vouchers', label: `Vouchers & credit notes (${db.vouchers.filter(v => v.balance > 0).length})` }, { id: 'history', label: 'Return history' }]} />
    {tab === 'return' && <Card>
      <form onSubmit={find} className="flex flex-wrap items-end gap-2 border-b border-border p-4"><Field label="Bill number"><Input value={no} onChange={e => setNo(e.target.value)} placeholder="NT-00123 or 123" /></Field><Button type="submit"><Search size={16} />Find bill</Button></form>
      {bill ? <div className="p-4">
        <div className="mb-3 text-sm">Bill <b>{bill.no}</b> · {dt(bill.at)} · {db.customers.find(c => c.id === bill.customerId)?.name || 'Walk-in'} · {inr(bill.total)}</div>
        <Table head={['Item', 'Sold', 'Already returned', 'Return qty', 'Refund value']}>
          {bill.lines.map(l => { const max = r2(l.qty - returnedQty(l.variantId)); return <tr key={l.variantId}><Td>{l.productName} <span className="text-muted">{l.variantLabel}</span></Td><Td>{qtyFmt(l.qty, l.unit)}</Td><Td>{returnedQty(l.variantId) || '—'}</Td>
            <Td><Input type="number" min={0} max={max} step={l.unit === 'm' ? 0.25 : 1} className="w-24" value={qty[l.variantId] || ''} disabled={max <= 0} onChange={e => setQty({ ...qty, [l.variantId]: Math.min(max, Math.max(0, +e.target.value)) })} /></Td>
            <Td className="num">{inr(((qty[l.variantId] || 0) * l.net) / l.qty, 2)}</Td></tr> })}
        </Table>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <Field label="Give back as"><Select value={mode} onChange={e => setMode(e.target.value as 'cash' | 'credit_note')}><option value="credit_note">Credit note (for exchange / later)</option><option value="cash">Cash refund</option></Select></Field>
          <div className="flex items-center gap-3"><span className="num text-xl font-semibold">{inr(amount)}</span>
            <Button variant="primary" disabled={amount <= 0} onClick={() => { const r = api.doReturn(bill.id, Object.entries(qty).map(([variantId, q]) => ({ variantId, qty: q })), mode); toast.ok(r.code ? `Credit note ${r.code} for ${inr(r.amount)}` : `Refund ${inr(r.amount)} in cash`); setBillId(null); setNo(''); setTab(r.code ? 'vouchers' : 'history') }}>Complete return</Button></div>
        </div>
        <p className="mt-2 text-xs text-muted">Returned items go back into stock. For an exchange, give a credit note and redeem it on the new bill as a "Voucher / credit note" payment.</p>
      </div> : <div className="p-10 text-center text-sm text-muted">Find the original bill to start a return.</div>}
    </Card>}
    {tab === 'vouchers' && <Card><Table head={['Code', 'Type', 'Customer', 'Issued', 'Value', 'Balance', 'Note']} empty="No vouchers yet">
      {db.vouchers.map(v => <tr key={v.id}><Td className="font-mono font-medium">{v.code}</Td><Td>{v.kind === 'gift' ? <Badge tone="accent">Gift voucher</Badge> : <Badge>Credit note</Badge>}</Td><Td>{db.customers.find(c => c.id === v.customerId)?.name || '—'}</Td>
        <Td>{dt(v.createdAt)}</Td><Td className="num">{inr(v.amount)}</Td><Td>{v.balance > 0 ? <span className="num font-medium text-success">{inr(v.balance)}</span> : <Badge>Used</Badge>}</Td><Td className="text-xs text-muted">{v.note}</Td></tr>)}</Table></Card>}
    {tab === 'history' && <Card><Table head={['Return', 'Date', 'Bill', 'Items', 'Amount', 'Given as']} empty="No returns yet">
      {db.returns.map(r => <tr key={r.id}><Td className="font-medium">{r.no}</Td><Td>{dt(r.at)}</Td><Td><a className="text-accent" href={'#/bills/' + r.billId}>{r.billNo}</a></Td><Td className="text-xs">{r.lines.map(l => `${l.label} ×${l.qty}`).join(', ')}</Td>
        <Td className="num">{inr(r.amount)}</Td><Td>{r.refundMode === 'cash' ? 'Cash' : r.voucherCode}</Td></tr>)}</Table></Card>}
    <Modal open={gv} onClose={() => setGv(false)} title="Sell a gift voucher" footer={<><Button onClick={() => setGv(false)}>Cancel</Button><Button variant="primary" onClick={() => { const n = +gvAmt; if (!(n > 0)) return; const code = api.issueGiftVoucher(n, undefined, gvNote); toast.ok(`Voucher ${code} for ${inr(n)}`); setGv(false); setTab('vouchers') }}>Issue voucher</Button></>}>
      <div className="grid gap-3"><Field label="Value (₹)"><Input type="number" value={gvAmt} onChange={e => setGvAmt(e.target.value)} /></Field>
        <div className="flex gap-2">{[500, 1000, 2000, 5000].map(n => <Button key={n} size="sm" onClick={() => setGvAmt(String(n))}>{inr(n)}</Button>)}</div>
        <Field label="Note (buyer, occasion)"><Input value={gvNote} onChange={e => setGvNote(e.target.value)} /></Field>
        <p className="text-xs text-muted">Take the voucher's value as a normal payment. It can be redeemed in parts on any bill.</p></div>
    </Modal>
  </>
}
