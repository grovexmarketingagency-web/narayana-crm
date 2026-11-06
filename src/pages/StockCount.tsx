import { useState } from 'react'
import { ScanLine } from 'lucide-react'
import { useStore, api, variantName } from '../lib/store'
import { dt, inr } from '../lib/format'
import { Button, Card, Select, Table, Td, Badge, PageHeader, Field, Tabs } from '../components/ui'
import { VariantSearch } from '../components/VariantSearch'

export default function StockCount() {
  const { db } = useStore()
  const cur = db.stockCounts.find(c => c.status === 'open')
  const [cat, setCat] = useState(''); const [view, setView] = useState<'diff' | 'all'>('diff'); const [armed, setArmed] = useState(false)
  const cats = [...new Set(db.products.map(p => p.category))]
  if (!cur) return <>
    <PageHeader title="Stock count" sub="Count a shelf or the whole shop by scanning every sticker. You'll see what's missing or extra before anything changes." />
    <Card className="max-w-lg p-5"><Field label="What are you counting?"><Select value={cat} onChange={e => setCat(e.target.value)}><option value="">Whole shop</option>{cats.map(c => <option key={c}>{c}</option>)}</Select></Field>
      <Button variant="primary" className="mt-4" onClick={() => api.startCount(cat)}><ScanLine size={16} />Start counting</Button></Card>
    <Card title="Past counts" className="mt-4"><Table head={['Started', 'Scope', 'Items scanned', 'Result']} empty="No counts yet">{db.stockCounts.map(c => <tr key={c.id}><Td>{dt(c.startedAt)}</Td><Td>{c.category || 'Whole shop'}</Td><Td>{Object.keys(c.scanned).length}</Td><Td>{c.status === 'applied' ? <Badge tone="success">Applied</Badge> : <Badge>Cancelled</Badge>}</Td></tr>)}</Table></Card>
  </>
  const scope = db.variants.filter(v => { const p = db.products.find(x => x.id === v.productId); return !cur.category || p?.category === cur.category })
  const rows = scope.map(v => ({ v, sys: v.stock, got: cur.scanned[v.id] || 0 })).map(r => ({ ...r, diff: Math.round((r.got - r.sys) * 100) / 100 }))
  const shown = view === 'diff' ? rows.filter(r => r.diff !== 0) : rows
  const missingValue = rows.filter(r => r.diff < 0).reduce((s, r) => s + -r.diff * r.v.cost, 0)
  return <>
    <PageHeader title={`Counting: ${cur.category || 'Whole shop'}`} sub={`Started ${dt(cur.startedAt)} · ${Object.values(cur.scanned).reduce((s, n) => s + n, 0)} scanned`} actions={<>
      <Button onClick={() => api.finishCount(cur.id, false)}>Cancel count</Button>
      {armed ? <Button variant="danger" onClick={() => { setArmed(false); api.finishCount(cur.id, true) }}>Yes, set stock to counted (unscanned = 0)</Button> : <Button variant="primary" onClick={() => setArmed(true)}>Apply correction</Button>}</>} />
    <div className="mb-4"><VariantSearch autoFocus onPick={v => api.countScan(cur.id, v.id, 1)} placeholder="Scan each sticker (one scan = one piece)" /></div>
    <div className="mb-3 grid grid-cols-3 gap-3 text-sm">
      <div className="rounded-md border border-border bg-surface p-3">Missing pieces <b className="num block text-lg text-danger">{rows.filter(r => r.diff < 0).reduce((s, r) => s - r.diff, 0)}</b><span className="text-xs text-muted">{inr(missingValue)} at cost</span></div>
      <div className="rounded-md border border-border bg-surface p-3">Extra pieces <b className="num block text-lg text-warning">{rows.filter(r => r.diff > 0).reduce((s, r) => s + r.diff, 0)}</b></div>
      <div className="rounded-md border border-border bg-surface p-3">Matching items <b className="num block text-lg text-success">{rows.filter(r => r.diff === 0).length}</b></div>
    </div>
    <Tabs value={view} onChange={setView} items={[{ id: 'diff', label: 'Differences' }, { id: 'all', label: 'All items' }]} />
    <Card><Table head={['Item', 'Barcode', 'System', 'Counted', 'Difference', '']} empty="No differences. Everything scanned matches.">
      {shown.map(r => <tr key={r.v.id}><Td>{variantName(db, r.v.id)}</Td><Td className="font-mono text-xs">{r.v.barcode}</Td><Td className="num">{r.sys}</Td><Td className="num">{r.got}</Td>
        <Td>{r.diff === 0 ? <Badge tone="success">OK</Badge> : <Badge tone={r.diff < 0 ? 'danger' : 'warning'}>{r.diff > 0 ? '+' : ''}{r.diff}</Badge>}</Td>
        <Td><div className="flex gap-1"><Button size="sm" variant="ghost" aria-label="Minus one" onClick={() => api.countScan(cur.id, r.v.id, -1)}>−</Button><Button size="sm" variant="ghost" aria-label="Plus one" onClick={() => api.countScan(cur.id, r.v.id, 1)}>+</Button></div></Td></tr>)}</Table></Card>
  </>
}
