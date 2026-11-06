import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import { Printer } from 'lucide-react'
import { useStore, api } from '../lib/store'
import { currentRoute } from '../lib/router'
import { inr, printPage } from '../lib/format'
import { Button, Card, Input, Select, PageHeader, Field, toast } from '../components/ui'

export function QR({ text, size = 72 }: { text: string; size?: number }) {
  const [src, set] = useState('')
  useEffect(() => { QRCode.toDataURL(text, { margin: 0, width: size * 2, errorCorrectionLevel: 'M' }).then(set) }, [text, size])
  return src ? <img src={src} width={size} height={size} alt={`QR code ${text}`} /> : <div style={{ width: size, height: size }} />
}
const barcodeCache = new Map<string, string>()
export function Barcode({ text, height = 34, width = 1.4 }: { text: string; height?: number; width?: number }) {
  const src = useMemo(() => {
    const k = `${text}|${height}|${width}`; if (barcodeCache.has(k)) return barcodeCache.get(k)!
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    try { JsBarcode(svg, text, { format: 'CODE128', height, width, margin: 0, displayValue: false }) } catch { return '' }
    const url = 'data:image/svg+xml;utf8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg)); barcodeCache.set(k, url); return url
  }, [text, height, width])
  return src ? <img src={src} alt={`Barcode ${text}`} style={{ height, maxWidth: '100%' }} /> : null
}

export default function Labels() {
  const { db } = useStore()
  const q = new URLSearchParams(currentRoute().split('?')[1] || '')
  const pur = db.purchases.find(p => p.id === q.get('pur'))
  const one = q.get('v')
  const [pid, setPid] = useState(q.get('p') || (one ? db.variants.find(v => v.id === one)?.productId || '' : ''))
  const [copies, setCopies] = useState<Record<string, number>>(() => pur ? Object.fromEntries(pur.lines.map(l => [l.variantId, Math.ceil(l.qty)])) : one ? { [one]: 1 } : {})
  const [layout, setLayout] = useState<'roll' | 'a4'>('roll')
  const code = db.shop.labelCode
  const vs = db.variants.filter(v => pur ? pur.lines.some(l => l.variantId === v.id) : !pid || v.productId === pid)
  const labels = vs.flatMap(v => Array.from({ length: copies[v.id] ?? 0 }, () => v))
  return <>
    <PageHeader title="Barcode labels" sub={pur ? `Labels for purchase ${pur.no}: one per piece received` : 'Print one label or a whole batch. Scanning it at the counter adds the exact size and colour.'}
      actions={<Button variant="primary" disabled={!labels.length} onClick={() => printPage(toast.err)}><Printer size={16} />Print {labels.length} label{labels.length === 1 ? '' : 's'}</Button>} />
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <Card className="no-print">
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2">
          {!pur && <Field label="Product"><Select value={pid} onChange={e => setPid(e.target.value)}><option value="">All products</option>{db.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>}
          <Field label="Paper"><Select value={layout} onChange={e => setLayout(e.target.value as 'roll' | 'a4')}><option value="roll">Label roll 50 × 25 mm</option><option value="a4">A4 sticker sheet (3 × 8)</option></Select></Field>
          <Field label="Code type"><Select value={code} onChange={e => api.saveShop({ ...db.shop, labelCode: e.target.value as 'barcode' | 'qr' })}><option value="barcode">Barcode (scanner gun)</option><option value="qr">QR code (phone camera / 2D scanner)</option></Select></Field>
          <div className="flex flex-wrap gap-2 sm:col-span-2"><Button size="sm" onClick={() => setCopies(Object.fromEntries(vs.map(v => [v.id, Math.max(0, Math.ceil(v.stock))])))}>One per piece in stock</Button>
            <Button size="sm" onClick={() => setCopies(Object.fromEntries(vs.map(v => [v.id, 1])))}>One of each</Button><Button size="sm" variant="ghost" onClick={() => setCopies({})}>Clear</Button></div>
        </div>
        <ul className="max-h-[60vh] divide-y divide-border overflow-auto">{vs.map(v => { const p = db.products.find(x => x.id === v.productId)!; return <li key={v.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
          <span className="min-w-0"><span className="block truncate font-medium">{p.name}</span><span className="text-xs text-muted">{[v.size, v.colour].filter(Boolean).join(' / ')} · {v.sku} · stock {v.stock}</span></span>
          <Input type="number" min={0} aria-label="Copies" className="h-9 w-20" value={copies[v.id] ?? ''} placeholder="0" onChange={e => setCopies({ ...copies, [v.id]: Math.max(0, +e.target.value) })} /></li> })}</ul>
      </Card>
      <div className="print-area">
        {!labels.length ? <div className="no-print rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted">Set copies on the left to preview labels.</div> :
          <div className={layout === 'a4' ? 'grid grid-cols-3 gap-0 bg-white' : 'flex flex-col items-start gap-2'}>{labels.slice(0, 600).map((v, i) => { const p = db.products.find(x => x.id === v.productId)!
            const meta = <><div className="font-bold uppercase tracking-wide">{db.shop.name}</div><div className="truncate">{p.name}</div><div>{[v.size, v.colour].filter(Boolean).join(' · ')}</div></>
            return <div key={i} className="overflow-hidden border border-dashed border-gray-300 bg-white p-1.5 text-black" style={{ width: layout === 'a4' ? '70mm' : '50mm', height: layout === 'a4' ? '37mm' : '25mm', breakInside: 'avoid' }}>
              {code === 'qr' ? <div className="flex h-full items-center gap-2"><QR text={v.barcode} size={layout === 'a4' ? 90 : 60} /><div className="min-w-0 text-[9px] leading-tight">{meta}<div className="mt-0.5 text-[12px] font-bold">{inr(v.mrp)}{p.unit === 'm' ? '/m' : ''}</div><div className="font-mono text-[8px]">{v.barcode}</div></div></div>
                : <div className="flex h-full flex-col justify-between text-[8px] leading-tight"><div className="flex items-start justify-between gap-1"><div className="min-w-0">{meta}</div><div className="whitespace-nowrap text-[12px] font-bold">{inr(v.mrp)}{p.unit === 'm' ? '/m' : ''}</div></div>
                  <div className="flex flex-col items-center"><Barcode text={v.barcode} height={layout === 'a4' ? 46 : 26} width={layout === 'a4' ? 1.6 : 1.2} /><div className="font-mono text-[8px]">{v.barcode} · {v.sku}</div></div></div>}
            </div> })}</div>}
        {labels.length > 600 && <p className="no-print mt-2 text-xs text-muted">Previewing the first 600. Print in batches of 600 or fewer.</p>}
      </div>
    </div>
  </>
}
