import { useState } from 'react'
import { Printer, MessageCircle, ArrowLeft, Download, FileText } from 'lucide-react'
import { billPDF } from '../lib/exports'
import { blockedDownload } from '../lib/exporter'
import { useStore, isPending } from '../lib/store'
import { go } from '../lib/router'
import { inr, inr2, dt, qtyFmt, dayKey, localToday, downloadCSV, r2 } from '../lib/format'
import { printPage } from '../lib/format'
import { Button, Card, Input, Select, Table, Td, Badge, PageHeader, Field , toast } from '../components/ui'
import type { Bill, DB } from '../lib/types'

export default function Bills() {
  const { db } = useStore()
  const [q, setQ] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [mode, setMode] = useState('')
  const list = db.bills.filter(b => {
    const k = dayKey(b.at); const c = db.customers.find(x => x.id === b.customerId)
    return (!from || k >= from) && (!to || k <= to) && (!mode || b.payments.some(p => p.mode === mode))
      && (!q || b.no.toLowerCase().includes(q.toLowerCase()) || c?.name.toLowerCase().includes(q.toLowerCase()) || c?.mobile.includes(q))
  }).slice().reverse()
  const total = list.reduce((s, b) => s + b.total, 0)
  return <>
    <PageHeader title="Bills" sub={`${list.length} bills · ${inr(total)}`} actions={<Button onClick={() => downloadCSV(`bills-${localToday()}.csv`, [['Bill', 'Date', 'Customer', 'Mobile', 'Items', 'Taxable', 'GST', 'Total', 'Payment', 'Status'], ...list.map(b => { const c = db.customers.find(x => x.id === b.customerId); return [b.no, dt(b.at), c?.name || '', c?.mobile || '', b.lines.length, b.taxable, b.tax, b.total, b.payments.map(p => `${p.mode}:${p.amount}`).join(' '), b.status] })])}><Download size={16} />Export</Button>} />
    <Card>
      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-4">
        <Field label="Search"><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Bill no, name or mobile" /></Field>
        <Field label="From"><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
        <Field label="Payment"><Select value={mode} onChange={e => setMode(e.target.value)}><option value="">All</option>{['cash', 'upi', 'card', 'credit', 'voucher', 'points'].map(m => <option key={m}>{m}</option>)}</Select></Field>
      </div>
      <Table head={['Bill', 'Date', 'Customer', 'Items', 'Total', 'Paid by', 'Status']} empty="No bills match these filters">
        {list.slice(0, 300).map(b => { const c = db.customers.find(x => x.id === b.customerId); return <tr key={b.id} className="cursor-pointer hover:bg-surface-2" onClick={() => go('/bills/' + b.id)}>
          <Td><a href={'#/bills/' + b.id} className="font-medium text-accent">{b.no}</a></Td><Td className="whitespace-nowrap text-muted">{dt(b.at)}</Td><Td>{c?.name || <span className="text-muted">Walk-in</span>}</Td>
          <Td>{b.lines.length}</Td><Td className="num font-medium">{inr(b.total)}</Td><Td className="text-xs uppercase text-muted">{b.payments.map(p => p.mode).join(' + ')}</Td>
          <Td>{b.returnedAmount > 0 ? <Badge tone="warning">Returned {inr(b.returnedAmount)}</Badge> : b.status === 'paid' ? <Badge tone="success">Paid</Badge> : <Badge tone="danger">{b.status === 'credit' ? 'On credit' : 'Part credit'}</Badge>}</Td>
        </tr> })}
      </Table>
    </Card>
  </>
}

export function billText(db: DB, b: Bill) {
  const c = db.customers.find(x => x.id === b.customerId)
  return [`*${db.shop.name}*`, `Bill ${b.no} · ${dt(b.at)}`, c ? `Customer: ${c.name}` : '', '',
    ...b.lines.map(l => `${l.productName} ${l.variantLabel} x${qtyFmt(l.qty, l.unit)} = ${inr2(l.net)}`), '',
    b.discount > 0 ? `You saved ${inr2(b.discount)}` : '', `*Total ${inr(b.total)}* (incl. GST ${inr2(b.tax)})`, c ? `Points earned: ${b.pointsEarned} · Balance: ${c.points}` : '', '', db.shop.billFooter].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n')
}

export function Receipt({ b }: { b: Bill }) {
  const { db } = useStore()
  const c = db.customers.find(x => x.id === b.customerId); const sm = db.salesmen.find(x => x.id === b.salesmanId)
  const byRate = new Map<number, { t: number; g: number }>(); b.lines.forEach(l => { const m = byRate.get(l.gstRate) || { t: 0, g: 0 }; m.t += l.taxable; m.g += l.tax; byRate.set(l.gstRate, m) })
  return <div className="receipt mx-auto p-3" style={db.shop.printerWidth === '58' ? { width: '48mm', fontSize: 9 } : undefined}>
    <div className="text-center"><div className="text-[15px] font-bold">{db.shop.name.toUpperCase()}</div><div>{db.shop.tagline}</div><div>{db.shop.address}</div><div>Ph {db.shop.phone}</div><div>GSTIN {db.shop.gstin}</div>
      <div className="my-1 font-bold">TAX INVOICE</div></div>
    <div className="flex justify-between"><span>Bill: {b.no}</span><span>{dt(b.at)}</span></div>
    {c && <div>Customer: {c.name} ({c.mobile})</div>}{sm && <div>Salesman: {sm.code}</div>}
    <div className="my-1 border-t border-dashed border-black" />
    <table className="w-full"><thead><tr><th className="text-left">Item</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amt</th></tr></thead>
      <tbody>{b.lines.map((l, i) => <tr key={i} className="align-top"><td>{l.productName} {l.variantLabel}<div className="text-[10px]">HSN {l.hsn} · GST {l.gstRate}%{l.discount > 0 ? ` · disc ${inr2(l.discount)}` : ''}</div></td>
        <td className="text-right">{qtyFmt(l.qty, l.unit)}</td><td className="text-right">{l.mrp}</td><td className="text-right">{l.net.toFixed(2)}</td></tr>)}</tbody></table>
    <div className="my-1 border-t border-dashed border-black" />
    <div className="flex justify-between"><span>Gross</span><span>{b.gross.toFixed(2)}</span></div>
    {b.discount > 0 && <div className="flex justify-between"><span>Discount{b.offerLabel ? ` (${b.offerLabel})` : ''}</span><span>-{b.discount.toFixed(2)}</span></div>}
    {[...byRate.entries()].map(([r, m]) => <div key={r} className="flex justify-between text-[10px]"><span>GST {r}%: taxable {m.t.toFixed(2)} CGST {(m.g / 2).toFixed(2)} SGST {(m.g / 2).toFixed(2)}</span></div>)}
    {b.roundOff !== 0 && <div className="flex justify-between"><span>Round off</span><span>{b.roundOff.toFixed(2)}</span></div>}
    <div className="mt-1 flex justify-between text-[14px] font-bold"><span>TOTAL</span><span>₹{b.total.toFixed(2)}</span></div>
    {b.payments.map((p, i) => <div key={i} className="flex justify-between"><span className="uppercase">{p.mode}{p.ref ? ` ${p.ref}` : ''}</span><span>{p.amount.toFixed(2)}</span></div>)}
    {c && <div className="mt-1">Points earned {b.pointsEarned}{b.pointsRedeemed ? `, used ${b.pointsRedeemed}` : ''}. Balance {c.points}{c.balance > 0 ? ` · Due ₹${r2(c.balance)}` : ''}</div>}
    <div className="my-1 border-t border-dashed border-black" />
    <div className="text-center">{db.shop.billFooter}</div>
  </div>
}

export function BillView({ id }: { id: string }) {
  const { db } = useStore()
  const b = db.bills.find(x => x.id === id)
  if (!b) return <div className="p-10 text-center text-muted">Bill not found. <a className="text-accent" href="#/bills">Back to bills</a></div>
  const c = db.customers.find(x => x.id === b.customerId)
  const wa = `https://wa.me/${c ? '91' + c.mobile : ''}?text=${encodeURIComponent(billText(db, b))}`
  return <>
    <PageHeader title={`Bill ${b.no}`} sub={`${dt(b.at)} · ${inr(b.total)}`} actions={<>
      <Button onClick={() => go('/bills')}><ArrowLeft size={16} />Back</Button>
      <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-2"><MessageCircle size={16} />Send on WhatsApp</a>
      <Button onClick={() => { if (!blockedDownload(toast.err)) billPDF(db, b) }}><FileText size={16} />PDF</Button>
      <Button variant="primary" onClick={() => printPage(toast.err)}><Printer size={16} />Print ({db.shop.printerWidth} mm)</Button>
      <Button variant="primary" onClick={() => go('/billing')}>Next bill</Button></>} />
    {isPending(b.id) && <p className="no-print mb-3 rounded-md bg-warning/10 p-3 text-sm text-warning">Saved on this counter. Waiting for the central database to confirm it, so the bill number can still change. Wait for this note to go before printing, or print and write the final number on the copy later.</p>}
    <div className="print-area rounded-lg border border-border bg-white py-4 shadow-sm sm:mx-auto sm:w-fit"><Receipt b={b} /></div>
  </>
}
