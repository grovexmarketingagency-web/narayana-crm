import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import { Printer, HelpCircle } from 'lucide-react'
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
  return src ? <img src={src} alt={`Barcode ${text}`} style={{ height, maxWidth: '100%', display: 'block', flexShrink: 0 }} /> : null
}

// label printer adjustments are remembered on this computer, so staff set them once
const rowsOf2 = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / 2) }, (_, i) => xs.slice(i * 2, i * 2 + 2))
function usePref(key: string, def: number): [number, (n: number) => void] {
  const [v, setV] = useState(() => { try { const x = localStorage.getItem('labels.' + key); return x === null || isNaN(+x) ? def : +x } catch { return def } })
  return [v, (n: number) => { setV(n); try { localStorage.setItem('labels.' + key, String(n)) } catch { /* private window */ } }]
}

export default function Labels() {
  const { db } = useStore()
  const q = new URLSearchParams(currentRoute().split('?')[1] || '')
  const pur = db.purchases.find(p => p.id === q.get('pur'))
  const one = q.get('v')
  const [pid, setPid] = useState(q.get('p') || (one ? db.variants.find(v => v.id === one)?.productId || '' : ''))
  const [copies, setCopies] = useState<Record<string, number>>(() => pur ? Object.fromEntries(pur.lines.map(l => [l.variantId, Math.ceil(l.qty)])) : one ? { [one]: 1 } : {})
  const [layout, setLayout] = useState<'roll' | 'roll2' | 'a4'>('roll2')
  const [shift, setShift] = usePref('shift', 0)     // moves everything on the label sideways, mm (negative = left), to match how the roll sits in the printer
  const [vshift, setVshift] = usePref('vshift', 0)   // − squeezes the label up from the bottom, + pushes it down, mm; never moves anything off the label
  const [pshift, setPshift] = usePref('pshift', 4)   // moves only the price left, mm, away from the right edge
  const [gap, setGap] = usePref('gap', 3)       // space between labels on the roll, mm
  const [rowGap, setRowGap] = usePref('rowGap', 0) // paper between one row of labels and the next, mm; only needed when the printer driver does not skip it itself
  const two = layout === 'roll2'
  const pageH = 25 + rowGap
  const rowW = 2 * 40 + gap
  const [help, setHelp] = useState(false)
  const [sec, setSec] = useState('')
  const secs = [...new Set(db.products.map(p => p.category))].sort()
  const secOf = (productId: string) => db.products.find(p => p.id === productId)?.category || ''
  const code = db.shop.labelCode
  const town = db.shop.address.split(',')[1]?.trim() || ''
  // printed section by section, so a roll comes out already sorted for the racks
  const vs = db.variants.filter(v => pur ? pur.lines.some(l => l.variantId === v.id) : (!pid || v.productId === pid) && (!sec || secOf(v.productId) === sec))
    .sort((a, b) => secOf(a.productId).localeCompare(secOf(b.productId)))
  const labels = vs.flatMap(v => Array.from({ length: copies[v.id] ?? 0 }, () => v))
  return <>
    <PageHeader title="Barcode labels" sub={pur ? `Labels for purchase ${pur.no}: one per piece received` : 'Print one label or a whole batch. Scanning it at the counter adds the exact size and colour.'}
      actions={<><Button variant="ghost" onClick={() => setHelp(!help)} aria-expanded={help}><HelpCircle size={16} />Printer not asked?</Button>
        <Button variant="primary" disabled={!labels.length} onClick={() => printPage(toast.err)}><Printer size={16} />Print {labels.length} label{labels.length === 1 ? '' : 's'}</Button></>} />
    {help && <div className="no-print mb-4 rounded-lg border border-gold/40 bg-gold/10 p-4 text-sm leading-relaxed">
      <p className="font-medium">If the screen flashes and nothing asks for a printer, this Chrome window is in direct-print mode (<code>--kiosk-printing</code>), which sends everything to the bill printer.</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>Close this window and open the <b>Narayana Labels</b> shortcut on the desktop (made by <code>printer-shortcuts.bat</code>).</li>
        <li>Press Print. In the print box, set <b>Destination</b> to the label printer (TSC TE244) once. Chrome remembers it next time.</li>
        <li>Keep using the <b>Narayana Billing</b> shortcut for bills: it still prints straight to the bill printer.</li>
      </ol>
      <p className="mt-2 text-muted">ബാർകോഡ് print-ന് "Narayana Labels" shortcut തുറക്കുക. ബില്ലിന് "Narayana Billing" തന്നെ.</p>
    </div>}
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <Card className="no-print">
        {!pur && <div className="border-b border-border p-4"><div className="mb-2 text-sm font-medium text-muted">1. Pick a section</div>
          <div className="flex flex-wrap gap-2">{['', ...secs].map(x => <button key={x || 'all'} onClick={() => { setSec(x); setPid(''); setCopies({}) }} aria-pressed={sec === x}
            className={`rounded-md border px-3 py-2 text-sm ${sec === x ? 'border-accent bg-accent text-on-accent' : 'border-border hover:bg-surface-2'}`}>{x || 'All sections'}<span className="ml-1.5 text-xs opacity-75">{x ? db.variants.filter(v => secOf(v.productId) === x).length : db.variants.length}</span></button>)}</div></div>}
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2">
          {!pur && <Field label="2. Product (optional)"><Select value={pid} onChange={e => setPid(e.target.value)}><option value="">{sec ? `Everything in ${sec}` : 'All products'}</option>{db.products.filter(p => !sec || p.category === sec).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>}
          <Field label="Paper"><Select value={layout} onChange={e => setLayout(e.target.value as 'roll' | 'roll2' | 'a4')}><option value="roll2">Label roll 40 × 25 mm, 2 across (TSC)</option><option value="roll">Label roll 50 × 25 mm</option><option value="a4">A4 sticker sheet (3 × 8)</option></Select></Field>
          {two && <Field label="Move print sideways, mm (− = left, + = right)"><Input type="number" min={-8} max={5} step={0.5} value={shift} onChange={e => setShift(Math.max(-8, Math.min(5, Number(e.target.value) || 0)))} /></Field>}
          {two && <Field label="Move print up/down, mm (− = up, + = down)"><Input type="number" min={-6} max={6} step={0.5} value={vshift} onChange={e => setVshift(Math.max(-6, Math.min(6, Number(e.target.value) || 0)))} /></Field>}
          <Field label="Move only the price left, mm (0 = at the right edge)"><Input type="number" min={0} max={10} step={0.5} value={pshift} onChange={e => setPshift(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} /></Field>
          {two && <Field label="Gap between rows, mm (labels creep up or down the roll? set this to the paper gap, e.g. 3)"><Input type="number" min={0} max={10} step={0.5} value={rowGap} onChange={e => setRowGap(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} /></Field>}
          {two && <Field label={`Gap between labels, mm (paper size to set in the printer: ${rowW} × ${pageH} mm)`}><Input type="number" min={0} max={10} step={0.5} value={gap} onChange={e => setGap(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} /></Field>}
          <Field label="Code type"><Select value={code} onChange={e => api.saveShop({ ...db.shop, labelCode: e.target.value as 'barcode' | 'qr' })}><option value="barcode">Barcode (scanner gun)</option><option value="qr">QR code (phone camera / 2D scanner)</option></Select></Field>
          <div className="flex flex-wrap gap-2 sm:col-span-2"><Button size="sm" onClick={() => setCopies(Object.fromEntries(vs.map(v => [v.id, Math.max(0, Math.ceil(v.stock))])))}>One per piece in stock</Button>
            <Button size="sm" onClick={() => setCopies(Object.fromEntries(vs.map(v => [v.id, 1])))}>One of each</Button><Button size="sm" variant="ghost" onClick={() => setCopies({})}>Clear</Button></div>
        </div>
        <ul className="max-h-[60vh] divide-y divide-border overflow-auto">{vs.map(v => { const p = db.products.find(x => x.id === v.productId)!; return <li key={v.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
          <span className="min-w-0"><span className="block truncate font-medium">{p.name}</span><span className="text-xs text-muted">{!sec && <>{p.category} · </>}{[v.size, v.colour].filter(Boolean).join(' / ')} · {v.barcode} · stock {v.stock}</span></span>
          <div className="w-20 shrink-0"><Input type="number" min={0} aria-label="Copies" className="h-9" value={copies[v.id] ?? ''} placeholder="0" onChange={e => setCopies({ ...copies, [v.id]: Math.max(0, +e.target.value) })} /></div></li> })}</ul>
      </Card>
      <div className="print-area">
        {two && <style>{`@media print { @page { size: ${rowW}mm ${pageH}mm; margin: 0 } .label-row { break-after: page; page-break-after: always } .label-row:last-child { break-after: auto; page-break-after: auto } }`}</style>}
        {!labels.length ? <div className="no-print rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted">Set copies on the left to preview labels.</div> :
          <div className={layout === 'a4' ? 'grid grid-cols-3 gap-0 bg-white' : two ? 'flex flex-col bg-white' : 'flex flex-col items-start gap-2'} style={two ? { width: rowW + 'mm' } : undefined}>{(two ? rowsOf2(labels.slice(0, 600)) : labels.slice(0, 600).map(v => [v])).map((row, r) => { const cells = row.map((v, c) => { const i = r * 10 + c; const p = db.products.find(x => x.id === v.productId)!
            const meta = <><div className={`truncate font-bold uppercase ${two ? '' : 'tracking-wide'}`}>{db.shop.name}</div><div className="truncate">{p.name}</div><div className="truncate">{[p.category, v.size, v.colour].filter(Boolean).join(' · ')}</div></>
            const box = <div className={`overflow-hidden border border-dashed border-gray-300 bg-white text-black ${two ? 'py-1' : 'p-1.5'}`} style={{ ...(two ? { paddingLeft: Math.max(0, 2.2 + shift) + 'mm', paddingRight: Math.max(0, 2.2 - shift) + 'mm' } : {}), width: layout === 'a4' ? '70mm' : two ? '40mm' : '50mm', height: layout === 'a4' ? '37mm' : two ? (25 - Math.abs(vshift)) + 'mm' : '25mm', marginTop: two ? Math.max(0, vshift) + 'mm' : undefined, breakInside: 'avoid' }}>
              {code === 'qr' ? <div className="flex h-full items-center gap-2"><QR text={v.barcode} size={layout === 'a4' ? 90 : two ? 44 : 60} /><div className="min-w-0 text-[9px] leading-tight">{meta}<div className="mt-0.5 text-[12px] font-bold">{inr(v.mrp)}{p.unit === 'm' ? '/m' : ''}</div><div className="font-mono text-[8px]">{v.barcode}</div></div></div>
                : <div className="flex h-full flex-col justify-between leading-tight">
                  <div className="min-w-0 text-center">
                    <div className="truncate font-bold uppercase" style={{ fontSize: layout === 'a4' ? 15 : two ? 11 : 13 }}>{db.shop.name}</div>
                    {town && <div className="font-bold uppercase tracking-wider" style={{ fontSize: layout === 'a4' ? 8 : 6 }}>{town}</div>}
                  </div>
                  <div className="min-w-0 text-[8px]"><div className="truncate font-bold">{p.name}{[v.size, v.colour].filter(Boolean).length ? ' · ' + [v.size, v.colour].filter(Boolean).join(' · ') : ''}</div>
                    <div className="flex items-baseline justify-between gap-1"><span className="truncate font-mono text-[7px] font-bold">{v.sku || v.barcode}</span><span className={`shrink-0 whitespace-nowrap font-bold ${two ? 'text-[11px]' : 'text-[13px]'}`} style={{ marginRight: pshift + 'mm' }}>{inr(v.mrp)}{p.unit === 'm' ? '/m' : ''}</span></div></div>
                  <div className="flex shrink-0 flex-col items-center"><Barcode text={v.barcode} height={layout === 'a4' ? 46 : two ? 15 : 26} width={layout === 'a4' ? 1.6 : two ? 0.9 : 1.2} /><div className="mt-px font-mono text-[7.5px] font-bold leading-none">{v.barcode}</div></div></div>}
            </div>
            return <div key={i} style={{ display: 'contents' }}>{box}</div> })
            // one row of two labels = one printed page of exactly the row's size, so nothing can creep from row to row
            return two ? <div key={r} className="label-row" style={{ height: pageH + 'mm', overflow: 'hidden', display: 'grid', gridTemplateColumns: '40mm 40mm', columnGap: gap + 'mm', alignContent: 'start' }}>
              <div style={{ display: 'contents' }}>{cells.map((cell, c) => <div key={c} style={{ height: '25mm', overflow: 'hidden' }}>{cell}</div>)}</div></div>
              : <div key={r} style={{ display: 'contents' }}>{cells}</div> })}</div>}
        {labels.length > 600 && <p className="no-print mt-2 text-xs text-muted">Previewing the first 600. Print in batches of 600 or fewer.</p>}
      </div>
    </div>
  </>
}
