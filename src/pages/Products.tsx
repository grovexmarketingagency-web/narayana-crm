import { useRef, useState } from 'react'
import { Plus, Upload, Download, Trash2, QrCode } from 'lucide-react'
import { useStore, api, getDB } from '../lib/store'
import { makeSku, nextBarcode } from '../lib/codes'
import { go } from '../lib/router'
import { inr, uid, downloadCSV } from '../lib/format'
import { Button, Card, Input, Select, Table, Td, Badge, PageHeader, Field, Modal, toast } from '../components/ui'
import type { Product, Variant } from '../lib/types'

export default function Products() {
  const { db } = useStore()
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [low, setLow] = useState(false)
  const [edit, setEdit] = useState<{ p: Product; vs: Variant[] } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const cats = [...new Set(db.products.map(p => p.category))].sort()
  const rows = db.products.filter(p => (!cat || p.category === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase()) || db.variants.some(v => v.productId === p.id && v.barcode.toLowerCase().includes(q.toLowerCase()))))
    .map(p => ({ p, vs: db.variants.filter(v => v.productId === p.id) })).filter(r => !low || r.vs.some(v => v.stock <= v.lowAt))
  const stockValue = db.variants.reduce((s, v) => s + Math.max(0, v.stock) * v.cost, 0)
  function importCSV(text: string) {
    const lines = text.trim().split(/\r?\n/); const head = lines.shift()!.toLowerCase().split(',').map(s => s.trim())
    const need = ['name', 'mrp']; if (!need.every(n => head.includes(n))) return toast.err('CSV needs at least name and mrp columns')
    const rows = lines.map(l => { const c = l.split(','); const o: Record<string, string> = {}; head.forEach((h, i) => (o[h] = (c[i] || '').trim())); return o })
    api.importProducts(rows.map(r => ({ sku: r.sku, brand: r.brand, name: r.name, category: r.category, hsn: r.hsn, gstType: (r.gsttype || r.gst_type || 'garment') as 'garment', unit: (r.unit === 'm' ? 'm' : 'pcs'), size: r.size, colour: r.colour || r.color, mrp: +r.mrp, cost: +r.cost, stock: +r.stock, barcode: r.barcode })))
    toast.ok(`Imported ${rows.length} rows`)
  }
  const blank = (): { p: Product; vs: Variant[] } => { const id = uid(); return { p: { id, name: '', category: cats[0] || 'Sarees', hsn: '', gstType: 'garment', unit: 'pcs', createdAt: new Date().toISOString() }, vs: [newVar(id)] } }
  const newVar = (pid: string, base?: Variant): Variant => ({ id: uid(), productId: pid, size: '', colour: '', sku: '', barcode: '', mrp: base?.mrp || 0, cost: base?.cost || 0, stock: 0, lowAt: db.shop.lowStockDefault, createdAt: new Date().toISOString() })
  return <>
    <PageHeader title="Products & stock" sub={`${db.products.length} products · ${db.variants.length} size/colour items · stock value ${inr(stockValue)} at cost`} actions={<>
      <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) importCSV(await f.text()); e.target.value = '' }} />
      <Button onClick={() => downloadCSV('product-import-template.csv', [['name', 'category', 'brand', 'hsn', 'gstType', 'unit', 'size', 'colour', 'mrp', 'cost', 'stock', 'sku', 'barcode'], ['Cotton Kurti', 'Kurtis', 'Narayana Own', '6204', 'garment', 'pcs', 'M', 'Blue', '799', '420', '10', '', '']])}><Download size={16} />Import template</Button>
      <Button onClick={() => file.current?.click()}><Upload size={16} />Import CSV</Button>
      <Button variant="primary" onClick={() => setEdit(blank())}><Plus size={16} />Add product</Button></>} />
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
        <Input className="max-w-xs" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or barcode" />
        <Select className="max-w-[180px]" value={cat} onChange={e => setCat(e.target.value)}><option value="">All categories</option>{cats.map(c => <option key={c}>{c}</option>)}</Select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={low} onChange={e => setLow(e.target.checked)} />Low stock only</label>
      </div>
      <Table head={['Product', 'Category', 'GST', 'Sizes / colours', 'Price', 'Stock', '']} empty="No products match">
        {rows.map(({ p, vs }) => { const st = vs.reduce((s, v) => s + v.stock, 0); const lowN = vs.filter(v => v.stock <= v.lowAt).length; const prices = [...new Set(vs.map(v => v.mrp))]
          return <tr key={p.id} className="hover:bg-surface-2"><Td><button className="text-left font-medium text-accent" onClick={() => setEdit({ p, vs })}>{p.name}</button><div className="text-xs text-muted">{p.brand ? p.brand + ' · ' : ''}HSN {p.hsn || '—'}</div></Td>
            <Td>{p.category}</Td><Td className="text-xs capitalize">{p.gstType}{p.unit === 'm' ? ' · per metre' : ''}</Td>
            <Td className="max-w-[240px] text-xs text-muted">{vs.map(v => [v.size, v.colour].filter(Boolean).join('/')).join(', ')}</Td>
            <Td className="num">{prices.length > 1 ? `${inr(Math.min(...prices))}–${inr(Math.max(...prices))}` : inr(prices[0] || 0)}</Td>
            <Td><span className="num">{Math.round(st * 100) / 100} {p.unit === 'm' ? 'm' : 'pcs'}</span> {lowN > 0 && <Badge tone="warning">{lowN} low</Badge>}</Td>
            <Td><a href={'#/labels?p=' + p.id} aria-label="Print labels" className="inline-flex rounded p-1.5 text-muted hover:bg-surface-2"><QrCode size={16} /></a></Td></tr> })}
      </Table>
    </Card>
    {edit && <Modal open onClose={() => setEdit(null)} wide title={edit.p.name ? `Edit ${edit.p.name}` : 'New product'} footer={<>
      {db.products.some(p => p.id === edit.p.id) && <Button variant="ghost" className="mr-auto text-danger" onClick={() => { api.deleteProduct(edit.p.id); setEdit(null) }}><Trash2 size={16} />Delete</Button>}
      <Button onClick={() => setEdit(null)}>Cancel</Button>
      <Button variant="primary" onClick={() => { if (!edit.p.name.trim()) return toast.err('Give the product a name'); if (edit.vs.some(v => !(v.mrp > 0))) return toast.err('Every row needs a selling price'); api.saveProduct(edit.p, edit.vs); toast.ok('Product saved'); setEdit(null) }}>Save product</Button></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Product name" className="sm:col-span-2"><Input value={edit.p.name} onChange={e => setEdit({ ...edit, p: { ...edit.p, name: e.target.value } })} placeholder="e.g. Soft Silk Saree" /></Field>
        <Field label="Brand"><Input list="brands" value={edit.p.brand || ''} onChange={e => setEdit({ ...edit, p: { ...edit.p, brand: e.target.value } })} /><datalist id="brands">{[...new Set(db.products.map(p => p.brand).filter(Boolean))].map(b => <option key={b} value={b} />)}</datalist></Field>
        <Field label="Supplier"><Select value={edit.p.supplierId || ''} onChange={e => setEdit({ ...edit, p: { ...edit.p, supplierId: e.target.value || undefined } })}><option value="">Not set</option>{db.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Category"><Input list="cats" value={edit.p.category} onChange={e => setEdit({ ...edit, p: { ...edit.p, category: e.target.value } })} /><datalist id="cats">{cats.map(c => <option key={c} value={c} />)}</datalist></Field>
        <Field label="HSN code"><Input value={edit.p.hsn} onChange={e => setEdit({ ...edit, p: { ...edit.p, hsn: e.target.value } })} placeholder="5007, 6204…" /></Field>
        <Field label="GST type" hint={edit.p.gstType === 'garment' ? `${db.shop.garmentLow}% up to ${inr(db.shop.garmentThreshold)}, ${db.shop.garmentHigh}% above` : edit.p.gstType === 'fabric' ? `${db.shop.fabricRate}%` : `${db.shop.otherRate}%`}>
          <Select value={edit.p.gstType} onChange={e => setEdit({ ...edit, p: { ...edit.p, gstType: e.target.value as Product['gstType'] } })}><option value="garment">Garment / saree</option><option value="fabric">Fabric / cloth</option><option value="other">Other</option></Select></Field>
        <Field label="Sold by"><Select value={edit.p.unit} onChange={e => setEdit({ ...edit, p: { ...edit.p, unit: e.target.value as 'pcs' | 'm' } })}><option value="pcs">Piece</option><option value="m">Metre</option></Select></Field>
      </div>
      <h3 className="mb-2 mt-5 text-sm font-semibold">Sizes & colours <span className="font-normal text-muted">· each row has its own stock and sticker</span></h3>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th className="p-1">Size</th><th className="p-1">Colour</th><th className="p-1">SKU code</th><th className="p-1">Barcode</th><th className="p-1">Selling ₹</th><th className="p-1">Purchase ₹</th><th className="p-1">{db.products.some(p => p.id === edit.p.id) ? 'Stock' : 'Opening stock'}</th><th className="p-1">Alert at</th><th /></tr></thead>
        <tbody>{edit.vs.map((v, i) => { const set = (k: keyof Variant, val: string | number) => setEdit({ ...edit, vs: edit.vs.map((x, j) => j === i ? { ...x, [k]: val } : x) })
          return <tr key={v.id}>{(['size', 'colour', 'sku', 'barcode'] as const).map(k => <td key={k} className="p-1"><Input className={`h-9 ${k === 'sku' ? 'min-w-[150px]' : 'min-w-[90px]'}`} value={v[k]} placeholder={k === 'barcode' || k === 'sku' ? 'auto' : ''} onChange={e => set(k, e.target.value)} /></td>)}
            {(['mrp', 'cost', 'stock', 'lowAt'] as const).map(k => <td key={k} className="p-1"><Input className="h-9 w-24" type="number" value={v[k]} onChange={e => set(k, +e.target.value)} /></td>)}
            <td className="p-1"><button aria-label="Print label" title="Print label" disabled={!v.barcode} onClick={() => go('/labels?v=' + v.id)} className="rounded p-1.5 text-muted hover:text-accent disabled:opacity-30"><QrCode size={15} /></button></td>
            <td className="p-1"><button aria-label="Remove row" disabled={edit.vs.length === 1} onClick={() => setEdit({ ...edit, vs: edit.vs.filter((_, j) => j !== i) })} className="rounded p-1.5 text-muted hover:text-danger disabled:opacity-30"><Trash2 size={15} /></button></td></tr> })}</tbody></table></div>
      <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => setEdit({ ...edit, vs: [...edit.vs, newVar(edit.p.id, edit.vs[edit.vs.length - 1])] })}><Plus size={14} />Add size / colour</Button>
        <Button size="sm" variant="ghost" onClick={() => { const d = structuredClone(getDB()); setEdit({ ...edit, vs: edit.vs.map(v => ({ ...v, sku: v.sku || makeSku(d, edit.p, v), barcode: v.barcode || nextBarcode(d) })) }) }}>Generate SKU & barcode now</Button></div>
      <p className="mt-1 text-xs text-muted">Leave SKU and barcode empty and they are created automatically when you save. Scanner guns read the barcode; you can also type an existing barcode.</p>
      {edit.vs.some(v => v.mrp > 0 && v.cost > 0) && <p className="mt-2 text-xs text-muted">Margin: {edit.vs.filter(v => v.mrp > 0 && v.cost > 0).map(v => `${v.size || v.colour || 'row'} ${Math.round((1 - v.cost / v.mrp) * 100)}%`).join(' · ')}</p>}
    </Modal>}
  </>
}
