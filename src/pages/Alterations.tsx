import { useState } from 'react'
import { Plus, Printer, MessageCircle } from 'lucide-react'
import { useStore, api } from '../lib/store'
import { inr, d, localToday } from '../lib/format'
import { printPage } from '../lib/format'
import { Button, Card, Input, Table, Td, Badge, PageHeader, Field, Modal, Tabs, Textarea, toast } from '../components/ui'
import type { Alteration } from '../lib/types'

export default function Alterations() {
  const { db } = useStore()
  const [tab, setTab] = useState<'pending' | 'ready' | 'delivered'>('pending')
  const [edit, setEdit] = useState<Partial<Alteration> | null>(null)
  const [slip, setSlip] = useState<Alteration | null>(null)
  const today = localToday()
  const list = db.alterations.filter(a => a.status === tab).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const count = (s: string) => db.alterations.filter(a => a.status === s).length
  const move = (a: Alteration, status: Alteration['status']) => { api.saveAlteration({ ...a, status }); toast.ok(`${a.no} marked ${status}`) }
  return <>
    <PageHeader title="Alterations" sub="Tailoring slips, due dates and pickup" actions={<Button variant="primary" onClick={() => setEdit({ dueDate: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10) })}><Plus size={16} />New slip</Button>} />
    <Tabs value={tab} onChange={setTab} items={[{ id: 'pending', label: `In tailoring (${count('pending')})` }, { id: 'ready', label: `Ready for pickup (${count('ready')})` }, { id: 'delivered', label: `Delivered (${count('delivered')})` }]} />
    <Card>
      <Table head={['Slip', 'Customer', 'Item & work', 'Tailor', 'Due', 'Charge', '']} empty={tab === 'ready' ? 'Nothing waiting for pickup' : 'No slips here'}>
        {list.map(a => { const late = a.status === 'pending' && a.dueDate < today; const msg = `Hello ${a.customerName}, your ${a.item} (slip ${a.no}) is ready for pickup at Narayana Textiles.${a.paid ? '' : ` Alteration charge: ${inr(a.charge)}.`}`
          return <tr key={a.id}><Td className="font-medium">{a.no}</Td><Td>{a.customerName}<div className="text-xs text-muted">{a.mobile}</div></Td><Td><div>{a.item}</div><div className="max-w-xs truncate text-xs text-muted">{a.work}</div></Td><Td>{a.tailor || '—'}</Td>
            <Td>{late ? <Badge tone="danger">Late · {d(a.dueDate)}</Badge> : d(a.dueDate)}</Td><Td className="num">{inr(a.charge)} {a.paid ? <Badge tone="success">paid</Badge> : <Badge tone="warning">to collect</Badge>}</Td>
            <Td className="whitespace-nowrap"><div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setSlip(a)} aria-label="Print slip"><Printer size={14} /></Button>
              {a.status === 'pending' && <Button size="sm" onClick={() => move(a, 'ready')}>Mark ready</Button>}
              {a.status === 'ready' && <><a className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-surface-2" target="_blank" rel="noreferrer" href={`https://wa.me/91${a.mobile}?text=${encodeURIComponent(msg)}`}><MessageCircle size={14} />Tell customer</a>
                <Button size="sm" variant="primary" onClick={() => api.saveAlteration({ ...a, status: 'delivered', paid: true })}>Delivered</Button></>}
              <Button size="sm" variant="ghost" onClick={() => setEdit(a)}>Edit</Button></div></Td></tr> })}
      </Table>
    </Card>
    <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${edit.no}` : 'New alteration slip'} footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={() => {
      if (!edit?.customerName?.trim() || !edit.item?.trim() || !edit.dueDate) return toast.err('Customer, item and due date are needed')
      const cu = db.customers.find(c => c.mobile === edit.mobile); api.saveAlteration({ ...edit, customerId: cu?.id } as Alteration); setEdit(null)
    }}>Save slip</Button></>}>
      {edit && <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer mobile"><Input inputMode="tel" value={edit.mobile || ''} onChange={e => { const m = e.target.value.replace(/\D/g, '').slice(0, 10); const cu = db.customers.find(c => c.mobile === m); setEdit({ ...edit, mobile: m, customerName: cu ? cu.name : edit.customerName }) }} /></Field>
        <Field label="Customer name"><Input value={edit.customerName || ''} onChange={e => setEdit({ ...edit, customerName: e.target.value })} /></Field>
        <Field label="Item"><Input value={edit.item || ''} placeholder="e.g. Saree blouse" onChange={e => setEdit({ ...edit, item: e.target.value })} /></Field>
        <Field label="Against bill no. (optional)"><Input value={edit.billNo || ''} onChange={e => setEdit({ ...edit, billNo: e.target.value })} /></Field>
        <Field label="Work to do" className="sm:col-span-2"><Textarea rows={2} value={edit.work || ''} onChange={e => setEdit({ ...edit, work: e.target.value })} placeholder="Measurements, style notes" /></Field>
        <Field label="Due date"><Input type="date" value={edit.dueDate || ''} onChange={e => setEdit({ ...edit, dueDate: e.target.value })} /></Field>
        <Field label="Tailor"><Input value={edit.tailor || ''} onChange={e => setEdit({ ...edit, tailor: e.target.value })} /></Field>
        <Field label="Charge (₹)"><Input type="number" value={edit.charge ?? 0} onChange={e => setEdit({ ...edit, charge: +e.target.value })} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={!!edit.paid} onChange={e => setEdit({ ...edit, paid: e.target.checked })} />Charge paid now</label>
      </div>}
    </Modal>
    <Modal open={!!slip} onClose={() => setSlip(null)} title="Alteration slip" footer={<Button variant="primary" onClick={() => printPage(toast.err)}><Printer size={16} />Print</Button>}>
      {slip && <div className="print-area"><div className="receipt mx-auto p-3"><div className="text-center text-[14px] font-bold">{db.shop.name.toUpperCase()}</div><div className="text-center">ALTERATION SLIP</div>
        <div className="my-1 border-t border-dashed border-black" /><div>Slip: {slip.no}</div><div>Customer: {slip.customerName} {slip.mobile}</div><div>Item: {slip.item}</div><div>Work: {slip.work}</div>
        <div>Due: {d(slip.dueDate)}</div><div>Charge: ₹{slip.charge} {slip.paid ? '(paid)' : '(pay at pickup)'}</div><div className="my-1 border-t border-dashed border-black" /><div className="text-center">Please bring this slip at pickup</div></div></div>}
    </Modal>
  </>
}
