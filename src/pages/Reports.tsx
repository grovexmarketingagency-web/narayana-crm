import { useState } from 'react'
import { Download, Tag, FileSpreadsheet, FileText } from 'lucide-react'
import { exportsFor } from '../lib/exports'
import { blockedDownload } from '../lib/exporter'
import { useStore, api } from '../lib/store'
import { inr, inr2, dayKey, localToday, downloadCSV, r2, uid, d } from '../lib/format'
import { Button, Card, Input, Table, Td, PageHeader, Field, Tabs, Bars, Stat, Badge, Select, toast } from '../components/ui'

type T = 'sales' | 'stock' | 'best' | 'hours' | 'dead' | 'gst' | 'profit'
export default function Reports() {
  const { db } = useStore()
  const [tab, setTab] = useState<T>('sales')
  const t = new Date(); const m0 = new Date(t.getFullYear(), t.getMonth(), 1)
  const [from, setFrom] = useState(dayKey(m0.toISOString())); const [to, setTo] = useState(localToday())
  const [deadDays, setDeadDays] = useState(90)
  const bills = db.bills.filter(b => { const k = dayKey(b.at); return k >= from && k <= to })
  const lines = bills.flatMap(b => b.lines.map(l => ({ ...l, b })))
  const sales = bills.reduce((s, b) => s + b.total, 0), returns = bills.reduce((s, b) => s + b.returnedAmount, 0)

  const byDay = new Map<string, { n: number; amt: number; tax: number }>(); bills.forEach(b => { const k = dayKey(b.at); const m = byDay.get(k) || { n: 0, amt: 0, tax: 0 }; m.n++; m.amt += b.total; m.tax += b.tax; byDay.set(k, m) })
  const group = (key: (l: typeof lines[0]) => string) => { const m = new Map<string, { k: string; qty: number; amt: number; profit: number }>(); lines.forEach(l => { const k = key(l); const x = m.get(k) || { k, qty: 0, amt: 0, profit: 0 }; x.qty += l.qty; x.amt += l.net; x.profit += l.taxable - l.cost; m.set(k, x) }); return [...m.values()].sort((a, b) => b.amt - a.amt) }
  const hours = Array.from({ length: 13 }, (_, i) => i + 9).map(h => ({ label: `${h > 12 ? h - 12 : h}${h >= 12 ? 'p' : 'a'}`, value: bills.filter(b => new Date(b.at).getHours() === h).length }))
  const cutoff = Date.now() - deadDays * 864e5
  const dead = db.variants.filter(v => v.stock > 0 && +new Date(v.lastSoldAt || v.createdAt) < cutoff).map(v => ({ v, p: db.products.find(p => p.id === v.productId)! }))
  const hsn = new Map<string, { hsn: string; qty: number; taxable: number; tax: number; rate: number }>(); lines.forEach(l => { const k = l.hsn + '@' + l.gstRate; const x = hsn.get(k) || { hsn: l.hsn, rate: l.gstRate, qty: 0, taxable: 0, tax: 0 }; x.qty += l.qty; x.taxable += l.taxable; x.tax += l.tax; hsn.set(k, x) })
  const rate = new Map<number, { taxable: number; tax: number }>(); lines.forEach(l => { const x = rate.get(l.gstRate) || { taxable: 0, tax: 0 }; x.taxable += l.taxable; x.tax += l.tax; rate.set(l.gstRate, x) })
  const taxable = bills.reduce((s, b) => s + b.taxable, 0), tax = bills.reduce((s, b) => s + b.tax, 0), cost = lines.reduce((s, l) => s + l.cost, 0)
  const exp = db.expenses.filter(e => { const k = dayKey(e.at); return k >= from && k <= to }).reduce((s, e) => s + e.amount, 0)
  const purchased = db.purchases.filter(p => { const k = dayKey(p.at); return k >= from && k <= to }).reduce((s, p) => s + p.total, 0)
  const exp2 = () => {
    if (tab === 'sales') downloadCSV(`sales-${from}-${to}.csv`, [['Date', 'Bills', 'Sales', 'GST'], ...[...byDay.entries()].sort().map(([k, v]) => [k, v.n, r2(v.amt), r2(v.tax)])])
    if (tab === 'best') downloadCSV(`best-sellers-${from}-${to}.csv`, [['Product', 'Qty', 'Sales', 'Profit'], ...group(l => l.productName).map(x => [x.k, r2(x.qty), r2(x.amt), r2(x.profit)])])
    if (tab === 'gst') downloadCSV(`gst-hsn-summary-${from}-${to}.csv`, [['HSN', 'GST %', 'Qty', 'Taxable', 'CGST', 'SGST', 'Total tax'], ...[...hsn.values()].map(x => [x.hsn, x.rate, r2(x.qty), r2(x.taxable), r2(x.tax / 2), r2(x.tax / 2), r2(x.tax)])])
    if (tab === 'dead') downloadCSV(`dead-stock-${deadDays}d.csv`, [['Product', 'Size', 'Colour', 'Barcode', 'Stock', 'Cost value', 'Last sold'], ...dead.map(({ v, p }) => [p.name, v.size, v.colour, v.barcode, v.stock, r2(v.stock * v.cost), v.lastSoldAt ? d(v.lastSoldAt) : 'never'])])
    if (tab === 'profit' || tab === 'hours') downloadCSV(`summary-${from}-${to}.csv`, [['Metric', 'Value'], ['Sales', sales], ['Returns', returns], ['Taxable', r2(taxable)], ['GST', r2(tax)], ['Cost of goods', r2(cost)], ['Expenses', exp], ['Net profit', r2(taxable - cost - exp)]])
  }
  return <>
    <PageHeader title="Reports" sub="Pick a date range, read the numbers, export to Excel (CSV)" actions={<>{tab === 'sales' && <><Button onClick={() => { if (!blockedDownload(toast.err)) exportsFor.salesExcel(db, from, to) }}><FileSpreadsheet size={16} />Excel</Button><Button onClick={() => { if (!blockedDownload(toast.err)) exportsFor.salesPDF(db, from, to) }}><FileText size={16} />PDF</Button></>}
      {tab === 'stock' ? <Button onClick={() => { if (!blockedDownload(toast.err)) exportsFor.stockExcel(db) }}><FileSpreadsheet size={16} />Stock Excel</Button> : <Button onClick={() => { if (!blockedDownload(toast.err)) exp2() }}><Download size={16} />CSV</Button>}</>} />
    <div className="no-print mb-4 flex flex-wrap items-end gap-3">
      <Field label="From"><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field><Field label="To"><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
      {[['Today', 0], ['7 days', 6], ['30 days', 29]].map(([l, n]) => <Button key={l} size="sm" onClick={() => { const x = new Date(); x.setDate(x.getDate() - (n as number)); setFrom(dayKey(x.toISOString())); setTo(localToday()) }}>{l}</Button>)}
    </div>
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Sales" value={inr(sales)} sub={`${bills.length} bills`} tone="accent" /><Stat label="GST collected" value={inr(tax)} /><Stat label="Returns" value={inr(returns)} /><Stat label="Net profit" value={inr(taxable - cost - exp - returns)} tone="success" sub="after cost, expenses, returns" /></div>
    <Tabs value={tab} onChange={setTab} items={[{ id: 'sales', label: 'Daily sales' }, { id: 'stock', label: 'Stock' }, { id: 'best', label: 'Best sellers' }, { id: 'hours', label: 'Busy hours' }, { id: 'dead', label: 'Dead stock' }, { id: 'gst', label: 'GST summary' }, { id: 'profit', label: 'Profit' }]} />
    {tab === 'sales' && <Card><div className="p-4 pt-8"><Bars data={[...byDay.entries()].sort().map(([k, v]) => ({ label: k.slice(8), value: v.amt }))} fmt={n => inr(n)} /></div>
      <Table head={['Date', 'Bills', 'Sales', 'GST', 'Average bill']}>{[...byDay.entries()].sort().reverse().map(([k, v]) => <tr key={k}><Td>{d(k)}</Td><Td>{v.n}</Td><Td className="num font-medium">{inr(v.amt)}</Td><Td className="num">{inr2(v.tax)}</Td><Td className="num">{inr(v.amt / v.n)}</Td></tr>)}</Table></Card>}
    {tab === 'stock' && (() => { const cats = new Map<string, { items: number; qty: number; cost: number; mrp: number; low: number }>()
      db.variants.forEach(v => { const p = db.products.find(x => x.id === v.productId)!; const k = p.category + (p.unit === 'm' ? ' (metres)' : ''); const c = cats.get(k) || { items: 0, qty: 0, cost: 0, mrp: 0, low: 0 }; c.items++; c.qty += Math.max(0, v.stock); c.cost += Math.max(0, v.stock) * v.cost; c.mrp += Math.max(0, v.stock) * v.mrp; if (v.stock <= v.lowAt) c.low++; cats.set(k, c) })
      const all = [...cats.values()].reduce((a, c) => ({ cost: a.cost + c.cost, mrp: a.mrp + c.mrp }), { cost: 0, mrp: 0 })
      return <div className="grid gap-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-3"><Stat label="Stock value at cost" value={inr(all.cost)} /><Stat label="Stock value at selling price" value={inr(all.mrp)} /><Stat label="Items at or below alert" value={db.variants.filter(v => v.stock <= v.lowAt).length} tone="danger" /></div>
        <Card title="Category-wise stock (current)"><Table head={['Category', 'Size/colour items', 'Qty in stock', 'Value at cost', 'Value at MRP', 'Low']}>{[...cats.entries()].sort((a, b) => b[1].cost - a[1].cost).map(([k, c]) => <tr key={k}><Td className="font-medium">{k}</Td><Td>{c.items}</Td><Td className="num">{r2(c.qty)}</Td><Td className="num">{inr(c.cost)}</Td><Td className="num">{inr(c.mrp)}</Td><Td>{c.low ? <Badge tone="warning">{c.low}</Badge> : '—'}</Td></tr>)}</Table></Card>
        <Card title="Size & colour-wise stock"><Table head={['SKU', 'Product', 'Size', 'Colour', 'Stock', 'Value at cost']}>{db.variants.slice().sort((a, b) => a.stock - b.stock).slice(0, 200).map(v => { const p = db.products.find(x => x.id === v.productId)!; return <tr key={v.id}><Td className="font-mono text-xs">{v.sku}</Td><Td>{p.name}</Td><Td>{v.size || '—'}</Td><Td>{v.colour}</Td><Td>{v.stock <= v.lowAt ? <Badge tone={v.stock <= 0 ? 'danger' : 'warning'}>{v.stock}</Badge> : v.stock}</Td><Td className="num">{inr(Math.max(0, v.stock) * v.cost)}</Td></tr> })}</Table></Card></div> })()}
    {tab === 'best' && <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Products"><Table head={['Product', 'Qty', 'Sales', 'Profit']}>{group(l => l.productName).slice(0, 15).map(x => <tr key={x.k}><Td>{x.k}</Td><Td className="num">{r2(x.qty)}</Td><Td className="num">{inr(x.amt)}</Td><Td className="num text-success">{inr(x.profit)}</Td></tr>)}</Table></Card>
      <div className="grid gap-4"><Card title="Categories"><Table head={['Category', 'Sales', 'Profit']}>{group(l => l.category).map(x => <tr key={x.k}><Td>{x.k}</Td><Td className="num">{inr(x.amt)}</Td><Td className="num text-success">{inr(x.profit)}</Td></tr>)}</Table></Card>
        <Card title="Selling sizes"><Table head={['Size', 'Pieces', 'Sales']}>{group(l => l.variantLabel.split(' / ')[0] || 'Free').filter(x => x.k).slice(0, 10).map(x => <tr key={x.k}><Td>{x.k}</Td><Td className="num">{r2(x.qty)}</Td><Td className="num">{inr(x.amt)}</Td></tr>)}</Table></Card></div></div>}
    {tab === 'hours' && <Card title="Bills by hour of day"><div className="p-4 pt-8"><Bars data={hours} height={200} fmt={n => `${n} bills`} /></div><p className="px-4 pb-4 text-sm text-muted">Use this to plan staff: put more salesmen on the floor in the busiest hours.</p></Card>}
    {tab === 'dead' && <Card title={<span>Items not sold in <Select className="ml-1 inline-block h-8 w-24" value={deadDays} onChange={e => setDeadDays(+e.target.value)}>{[30, 60, 90, 180].map(n => <option key={n} value={n}>{n} days</option>)}</Select></span>}
      action={dead.length > 0 && <Button size="sm" variant="primary" onClick={() => { const cats = [...new Set(dead.map(x => x.p.category))]; cats.forEach(c => api.saveOffer({ id: uid(), name: `Clearance 20% · ${c}`, type: 'percent', value: 20, buyQty: 0, getQty: 0, minAmount: 0, category: c, couponCode: '', startsOn: localToday(), endsOn: '', active: true })); toast.ok(`Clearance offer started for ${cats.join(', ')}`) }}><Tag size={14} />Start 20% clearance</Button>}>
      <div className="px-4 pt-3 text-sm">Money stuck in these items: <b className="num text-danger">{inr(dead.reduce((s, x) => s + x.v.stock * x.v.cost, 0))}</b> at cost</div>
      <Table head={['Product', 'Size / colour', 'Stock', 'Cost value', 'Last sold']} empty="Nothing is sitting idle. Good going!">{dead.map(({ v, p }) => <tr key={v.id}><Td>{p.name}</Td><Td className="text-muted">{[v.size, v.colour].filter(Boolean).join(' / ')}</Td><Td>{v.stock}</Td><Td className="num">{inr(v.stock * v.cost)}</Td><Td>{v.lastSoldAt ? d(v.lastSoldAt) : <Badge tone="danger">Never</Badge>}</Td></tr>)}</Table></Card>}
    {tab === 'gst' && <div className="grid gap-4">
      <Card title="Tax by rate (B2C sales, intra-state)"><Table head={['GST rate', 'Taxable value', 'CGST', 'SGST', 'Total tax']}>{[...rate.entries()].sort((a, b) => a[0] - b[0]).map(([r, x]) => <tr key={r}><Td>{r}%</Td><Td className="num">{inr2(x.taxable)}</Td><Td className="num">{inr2(x.tax / 2)}</Td><Td className="num">{inr2(x.tax / 2)}</Td><Td className="num font-medium">{inr2(x.tax)}</Td></tr>)}
        <tr className="font-semibold"><Td>Total</Td><Td className="num">{inr2(taxable)}</Td><Td className="num">{inr2(tax / 2)}</Td><Td className="num">{inr2(tax / 2)}</Td><Td className="num">{inr2(tax)}</Td></tr></Table></Card>
      <Card title="HSN-wise summary (for GSTR-1 table 12)"><Table head={['HSN', 'Rate', 'Qty', 'Taxable', 'CGST', 'SGST']}>{[...hsn.values()].sort((a, b) => a.hsn.localeCompare(b.hsn)).map(x => <tr key={x.hsn + x.rate}><Td className="font-mono">{x.hsn}</Td><Td>{x.rate}%</Td><Td className="num">{r2(x.qty)}</Td><Td className="num">{inr2(x.taxable)}</Td><Td className="num">{inr2(x.tax / 2)}</Td><Td className="num">{inr2(x.tax / 2)}</Td></tr>)}</Table></Card>
      <p className="text-xs text-muted">Rates follow the shop's GST settings. Confirm figures with your accountant before filing.</p></div>}
    {tab === 'profit' && <Card className="max-w-xl"><dl className="divide-y divide-border text-sm">{[['Sales (incl. GST)', sales], ['less GST collected', -tax], ['Net sales', taxable], ['less cost of goods sold', -cost], ['Gross profit', taxable - cost], ['less expenses', -exp], ['less returns', -returns], ['Net profit', taxable - cost - exp - returns]].map(([k, v], i) =>
      <div key={i} className={`flex justify-between px-4 py-2.5 ${[2, 4, 7].includes(i) ? 'font-semibold' : 'text-muted'}`}><dt>{k}</dt><dd className={`num ${i === 7 ? 'text-success text-base' : ''}`}>{inr(v as number)}</dd></div>)}
      <div className="flex justify-between px-4 py-2.5 text-muted"><dt>Stock purchased in this period</dt><dd className="num">{inr(purchased)}</dd></div></dl></Card>}
  </>
}
