import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useStore, api } from '../lib/store'
import { inr, uid } from '../lib/format'
import { Button, Card, Input, Select, Table, Td, Badge, PageHeader, Field, Modal, toast } from '../components/ui'
import type { Offer } from '../lib/types'

const describe = (o: Offer) => o.type === 'percent' ? `${o.value}% off${o.category ? ' ' + o.category : ''}${o.minAmount ? ` above ${inr(o.minAmount)}` : ''}`
  : o.type === 'bxgy' ? `Buy ${o.buyQty} get ${o.getQty} free${o.category ? ' in ' + o.category : ''} (cheapest free)` : `${inr(o.value)} off when bill is ${inr(o.minAmount)}+`

export default function Offers() {
  const { db } = useStore()
  const [e, setE] = useState<Offer | null>(null)
  const cats = [...new Set(db.products.map(p => p.category))]
  const usage = (o: Offer) => db.bills.filter(b => b.offerLabel === o.name).length
  return <>
    <PageHeader title="Offers & coupons" sub="Automatic offers apply at the counter by themselves (the best one wins). Coupon offers apply only when the code is typed." actions={<Button variant="primary" onClick={() => setE({ id: uid(), name: '', type: 'percent', value: 10, buyQty: 2, getQty: 1, minAmount: 0, category: '', couponCode: '', startsOn: '', endsOn: '', active: true })}><Plus size={16} />New offer</Button>} />
    <Card><Table head={['Offer', 'Rule', 'How it applies', 'Dates', 'Used on', 'Status', '']} empty="No offers yet">
      {db.offers.map(o => <tr key={o.id}><Td className="font-medium">{o.name}</Td><Td className="text-sm">{describe(o)}</Td><Td>{o.couponCode ? <Badge tone="accent">Code {o.couponCode}</Badge> : <Badge>Automatic</Badge>}</Td>
        <Td className="text-xs text-muted">{o.startsOn || o.endsOn ? `${o.startsOn || '…'} → ${o.endsOn || '…'}` : 'Always'}</Td><Td>{usage(o)} bills</Td>
        <Td><button onClick={() => api.saveOffer({ ...o, active: !o.active })}>{o.active ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}</button></Td>
        <Td><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setE(o)}>Edit</Button><Button size="sm" variant="ghost" aria-label="Delete" onClick={() => api.deleteOffer(o.id)}><Trash2 size={14} /></Button></div></Td></tr>)}</Table></Card>
    <Modal open={!!e} onClose={() => setE(null)} title="Offer" footer={<><Button onClick={() => setE(null)}>Cancel</Button><Button variant="primary" onClick={() => { if (!e?.name.trim()) return toast.err('Name the offer'); api.saveOffer({ ...e, couponCode: e.couponCode.trim().toUpperCase() }); setE(null) }}>Save offer</Button></>}>
      {e && <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name (shown on bill)" className="sm:col-span-2"><Input value={e.name} onChange={x => setE({ ...e, name: x.target.value })} placeholder="e.g. Pongal 15% off silks" /></Field>
        <Field label="Type"><Select value={e.type} onChange={x => setE({ ...e, type: x.target.value as Offer['type'] })}><option value="percent">Percent off</option><option value="bxgy">Buy X get Y free</option><option value="flat">Flat ₹ off above amount</option></Select></Field>
        <Field label="Category"><Select value={e.category} onChange={x => setE({ ...e, category: x.target.value })}><option value="">Everything</option>{cats.map(c => <option key={c}>{c}</option>)}</Select></Field>
        {e.type === 'bxgy' ? <><Field label="Buy"><Input type="number" value={e.buyQty} onChange={x => setE({ ...e, buyQty: +x.target.value })} /></Field><Field label="Get free"><Input type="number" value={e.getQty} onChange={x => setE({ ...e, getQty: +x.target.value })} /></Field></>
          : <Field label={e.type === 'percent' ? 'Percent' : 'Amount off (₹)'}><Input type="number" value={e.value} onChange={x => setE({ ...e, value: +x.target.value })} /></Field>}
        {e.type !== 'bxgy' && <Field label="Minimum bill (₹)"><Input type="number" value={e.minAmount} onChange={x => setE({ ...e, minAmount: +x.target.value })} /></Field>}
        <Field label="Coupon code (leave empty for automatic)"><Input value={e.couponCode} onChange={x => setE({ ...e, couponCode: x.target.value.toUpperCase() })} /></Field>
        <div />
        <Field label="Starts"><Input type="date" value={e.startsOn} onChange={x => setE({ ...e, startsOn: x.target.value })} /></Field>
        <Field label="Ends"><Input type="date" value={e.endsOn} onChange={x => setE({ ...e, endsOn: x.target.value })} /></Field>
      </div>}
    </Modal>
  </>
}
