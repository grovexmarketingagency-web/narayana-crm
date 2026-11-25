import { useState } from 'react'
import { useStore } from '../lib/store'
import { gstRateFor } from '../lib/calc'
import { inr2, r2 } from '../lib/format'
import { Card, Field, Input, Select, PageHeader, Tabs } from '../components/ui'
import type { GstType } from '../lib/types'

/* Common HSN codes for a textile shop. A starting point only: confirm with the accountant for each product. */
const HSN: { code: string; item: string; type: GstType }[] = [
  { code: '5007', item: 'Silk fabric, silk sarees (woven silk)', type: 'fabric' },
  { code: '5208', item: 'Cotton fabric (≥85% cotton, up to 200 g/m²): cotton sarees, dhoti, lungi cloth, running material', type: 'fabric' },
  { code: '5209', item: 'Heavier cotton fabric (over 200 g/m²)', type: 'fabric' },
  { code: '5407', item: 'Synthetic filament fabric: polyester, georgette, chiffon sarees and material', type: 'fabric' },
  { code: '5408', item: 'Artificial filament fabric: viscose, rayon', type: 'fabric' },
  { code: '5512', item: 'Synthetic staple fibre fabric', type: 'fabric' },
  { code: '5810', item: 'Embroidery in the piece, laces', type: 'fabric' },
  { code: '6104', item: "Women's suits, kurtis, dresses (knitted)", type: 'garment' },
  { code: '6109', item: 'T-shirts and vests (knitted)', type: 'garment' },
  { code: '6111', item: "Babies' garments (knitted)", type: 'garment' },
  { code: '6203', item: "Men's suits, trousers, shorts (woven)", type: 'garment' },
  { code: '6204', item: "Women's suits, churidar sets, skirts, dresses (woven)", type: 'garment' },
  { code: '6205', item: "Men's shirts (woven)", type: 'garment' },
  { code: '6206', item: "Women's blouses, shirts, tops, kurtis (woven)", type: 'garment' },
  { code: '6209', item: "Babies' garments (woven)", type: 'garment' },
  { code: '6211', item: 'Track suits, other garments', type: 'garment' },
  { code: '6214', item: 'Shawls, scarves, dupattas, stoles', type: 'garment' },
  { code: '6302', item: 'Bed linen, towels, table linen', type: 'other' },
]

export default function Tools() {
  const [tab, setTab] = useState<'margin'>('margin')
  return <>
    <PageHeader title="Shop tools" sub="Quick calculators for pricing" />
    <Tabs value={tab} onChange={setTab} items={[{ id: 'margin', label: 'Price & margin' }]} />
    <div className="mt-4"><Margin /></div>
  </>
}

function GstCalc() {
  const { db } = useStore()
  const [price, setPrice] = useState('2999'); const [type, setType] = useState<GstType>('garment'); const [mode, setMode] = useState<'incl' | 'excl'>('incl')
  const p = +price || 0
  // the slab is decided on the selling price per piece after discount
  const rate = gstRateFor(db.shop, type, mode === 'incl' ? p : p * (1 + db.shop.garmentLow / 100))
  const taxable = mode === 'incl' ? r2(p / (1 + rate / 100)) : p
  const tax = r2(taxable * rate / 100); const total = r2(taxable + tax)
  return <Card className="max-w-xl p-5"><div className="grid gap-3 sm:grid-cols-3">
    <Field label="Price per piece (₹)"><Input type="number" min={0} value={price} onChange={e => setPrice(e.target.value)} /></Field>
    <Field label="Item"><Select value={type} onChange={e => setType(e.target.value as GstType)}><option value="garment">Readymade garment</option><option value="fabric">Fabric / saree / cloth</option><option value="other">Other</option></Select></Field>
    <Field label="Price is"><Select value={mode} onChange={e => setMode(e.target.value as 'incl' | 'excl')}><option value="incl">GST included</option><option value="excl">before GST</option></Select></Field></div>
    <dl className="mt-5 space-y-1.5 text-sm">
      <Row k="GST rate" v={`${rate}%`} />
      <Row k="Taxable value" v={inr2(taxable)} />
      <Row k={`CGST ${rate / 2}%`} v={inr2(tax / 2)} /><Row k={`SGST ${rate / 2}%`} v={inr2(tax / 2)} />
      <Row k="Customer pays" v={<b>{inr2(total)}</b>} />
    </dl>
    {type === 'garment' && <p className="mt-3 text-xs text-muted">Garments up to ₹{db.shop.garmentThreshold} per piece (after discount) are {db.shop.garmentLow}%; above that {db.shop.garmentHigh}%. Change the rates in Settings.</p>}
  </Card>
}

function HsnFinder() {
  const [q, setQ] = useState('')
  const s = q.trim().toLowerCase()
  const rows = HSN.filter(h => !s || h.code.startsWith(s) || h.item.toLowerCase().includes(s))
  return <Card className="max-w-3xl p-5">
    <Field label="Search by product or code"><Input autoFocus value={q} placeholder="e.g. saree, kurti, shirt, 6205" onChange={e => setQ(e.target.value)} /></Field>
    <ul className="mt-4 divide-y divide-border rounded-md border border-border">{rows.map(h => <li key={h.code} className="flex gap-4 px-3 py-2 text-sm"><span className="num w-14 font-semibold text-accent">{h.code}</span><span className="flex-1">{h.item}</span><span className="text-xs capitalize text-muted">{h.type}</span></li>)}
      {!rows.length && <li className="px-3 py-6 text-center text-muted">No match. Ask your accountant for this item's HSN code.</li>}</ul>
    <p className="mt-3 text-xs text-muted">A starting list only. HSN depends on the fibre and whether the cloth is knitted or woven, so confirm each product with your accountant.</p>
  </Card>
}

function Margin() {
  const { db } = useStore()
  const [cost, setCost] = useState('1200'); const [mrp, setMrp] = useState('1999'); const [type, setType] = useState<GstType>('garment')
  const c = +cost || 0, m = +mrp || 0
  const rate = gstRateFor(db.shop, type, m)
  const net = r2(m / (1 + rate / 100))             // what the shop keeps after paying GST on the sale
  const profit = r2(net - c)
  const [want, setWant] = useState('40')
  const target = c * (1 + (+want || 0) / 100)          // what the shop should keep per piece
  const priceAt = (r: number) => Math.ceil(target * (1 + r / 100) / 10) * 10 - 1   // rounded to end in 9
  const low = priceAt(gstRateFor(db.shop, type, 0)); const suggested = gstRateFor(db.shop, type, low) === gstRateFor(db.shop, type, 0) ? low : priceAt(gstRateFor(db.shop, type, low))
  return <Card className="max-w-xl p-5"><div className="grid gap-3 sm:grid-cols-3">
    <Field label="Cost price (₹)"><Input type="number" value={cost} onChange={e => setCost(e.target.value)} /></Field>
    <Field label="Selling price, MRP (₹)"><Input type="number" value={mrp} onChange={e => setMrp(e.target.value)} /></Field>
    <Field label="Item"><Select value={type} onChange={e => setType(e.target.value as GstType)}><option value="garment">Garment</option><option value="fabric">Fabric</option><option value="other">Other</option></Select></Field></div>
    <dl className="mt-5 space-y-1.5 text-sm">
      <Row k={`GST in the price (${rate}%)`} v={inr2(m - net)} />
      <Row k="Profit per piece" v={<b className={profit < 0 ? 'text-danger' : 'text-success'}>{inr2(profit)}</b>} />
      <Row k="Margin (profit ÷ selling price before GST)" v={net ? `${r2(profit / net * 100)}%` : '–'} />
      <Row k="Markup (profit ÷ cost)" v={c ? `${r2(profit / c * 100)}%` : '–'} />
    </dl>
    <div className="mt-5 grid grid-cols-2 items-end gap-3 border-t border-border pt-4">
      <Field label="Markup you want (%)"><Input type="number" value={want} onChange={e => setWant(e.target.value)} /></Field>
      <div className="text-sm">Suggested MRP <div className="num text-xl font-semibold text-accent">{c ? inr2(Math.max(0, suggested)) : '–'}</div></div>
    </div>
  </Card>
}
const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between"><dt className="text-muted">{k}</dt><dd className="num">{v}</dd></div>
