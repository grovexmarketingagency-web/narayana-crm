import { AlertTriangle, Scissors, Wallet } from 'lucide-react'
import { useStore } from '../lib/store'
import { inr, dayKey, localToday, d } from '../lib/format'
import { Card, Stat, Bars, Badge } from '../components/ui'

export default function Dashboard() {
  const { db } = useStore()
  const today = localToday()
  const tb = db.bills.filter(b => dayKey(b.at) === today)
  const sales = tb.reduce((s, b) => s + b.total - b.returnedAmount, 0)
  const cost = tb.reduce((s, b) => s + b.lines.reduce((x, l) => x + l.cost, 0), 0)
  const taxable = tb.reduce((s, b) => s + b.taxable, 0)
  const exp = db.expenses.filter(e => dayKey(e.at) === today).reduce((s, e) => s + e.amount, 0)
  const days = Array.from({ length: 14 }, (_, i) => { const x = new Date(); x.setDate(x.getDate() - 13 + i); const k = dayKey(x.toISOString()); return { label: x.getDate() + '', value: db.bills.filter(b => dayKey(b.at) === k).reduce((s, b) => s + b.total, 0) } })
  const best = new Map<string, { name: string; qty: number; amt: number }>()
  db.bills.slice(-150).forEach(b => b.lines.forEach(l => { const m = best.get(l.productName) || { name: l.productName, qty: 0, amt: 0 }; m.qty += l.unit === 'm' ? 1 : l.qty; m.amt += l.net; best.set(l.productName, m) }))
  const top = [...best.values()].sort((a, b) => b.amt - a.amt).slice(0, 6)
  const low = db.variants.filter(v => v.stock <= v.lowAt).slice(0, 8)
  const dues = db.customers.filter(c => c.balance > 0).sort((a, b) => b.balance - a.balance)
  const alts = db.alterations.filter(a => a.status !== 'delivered').sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const pay = new Map<string, number>(); tb.forEach(b => b.payments.forEach(p => pay.set(p.mode, (pay.get(p.mode) || 0) + p.amount)))
  return <>
    <div className="mb-5"><h1 className="font-display text-2xl font-semibold">Today at the counter</h1><p className="text-sm text-muted">{d(new Date().toISOString())}</p></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Today's sales" value={inr(sales)} sub={`${tb.length} bills`} tone="accent" />
      <Stat label="Gross profit" value={inr(taxable - cost)} sub={`after cost, before ₹${exp} expenses`} tone="success" />
      <Stat label="Average bill" value={inr(tb.length ? sales / tb.length : 0)} sub={[...pay.entries()].map(([m, v]) => `${m} ${inr(v)}`).join(' · ') || 'no payments yet'} />
      <Stat label="Money to collect" value={inr(dues.reduce((s, c) => s + c.balance, 0))} sub={`${dues.length} customers on credit`} tone="danger" />
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <Card title="Sales, last 14 days" className="lg:col-span-2"><div className="p-4 pt-8"><Bars data={days} fmt={n => inr(n)} /></div></Card>
      <Card title="Best sellers (recent)"><ul className="divide-y divide-border">{top.map((t, i) => <li key={t.name} className="flex items-center justify-between px-4 py-2.5 text-sm"><span><span className="mr-2 text-muted">{i + 1}.</span>{t.name}</span><span className="num font-medium">{inr(t.amt)}</span></li>)}</ul></Card>
      <Card title={<span className="flex items-center gap-2"><AlertTriangle size={16} className="text-warning" />Low stock</span>} action={<a href="#/products" className="text-xs text-accent">All products</a>}>
        <ul className="divide-y divide-border">{low.length ? low.map(v => { const p = db.products.find(x => x.id === v.productId)!; return <li key={v.id} className="flex justify-between px-4 py-2 text-sm"><span className="truncate">{p.name} <span className="text-muted">{v.size} {v.colour}</span></span><Badge tone={v.stock <= 0 ? 'danger' : 'warning'}>{v.stock} left</Badge></li> }) : <li className="px-4 py-6 text-center text-sm text-muted">All stock above alert level</li>}</ul></Card>
      <Card title={<span className="flex items-center gap-2"><Scissors size={16} />Alterations due</span>} action={<a href="#/alterations" className="text-xs text-accent">Open</a>}>
        <ul className="divide-y divide-border">{alts.length ? alts.slice(0, 6).map(a => <li key={a.id} className="flex justify-between px-4 py-2 text-sm"><span>{a.customerName} · {a.item}</span>
          {a.status === 'ready' ? <Badge tone="success">Ready</Badge> : a.dueDate < today ? <Badge tone="danger">Late</Badge> : <Badge>{a.dueDate.slice(5)}</Badge>}</li>) : <li className="px-4 py-6 text-center text-sm text-muted">No alterations pending</li>}</ul></Card>
      <Card title={<span className="flex items-center gap-2"><Wallet size={16} />Top dues</span>} action={<a href="#/credit" className="text-xs text-accent">Collect</a>}>
        <ul className="divide-y divide-border">{dues.length ? dues.slice(0, 6).map(c => <li key={c.id} className="flex justify-between px-4 py-2 text-sm"><span>{c.name}</span><span className="num font-medium text-danger">{inr(c.balance)}</span></li>) : <li className="px-4 py-6 text-center text-sm text-muted">Nobody owes money</li>}</ul></Card>
    </div>
  </>
}
