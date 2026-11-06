import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useStore, api, currentStaff } from '../lib/store'
import { inr, uid } from '../lib/format'
import { readOnly } from '../lib/access'
import { Button, Card, Input, Table, Td, PageHeader, Field, Modal, toast } from '../components/ui'
import type { Supplier } from '../lib/types'

export default function Suppliers() {
  const { db } = useStore(); const ro = readOnly(currentStaff()!.role)
  const [e, setE] = useState<Supplier | null>(null)
  return <>
    <PageHeader title="Suppliers" actions={!ro && <Button variant="primary" onClick={() => setE({ id: uid(), name: '', mobile: '', gstin: '', city: '' })}><Plus size={16} />Add supplier</Button>} />
    <Card><Table head={['Name', 'City', 'Mobile', 'GSTIN', 'Purchases', '']} empty="No suppliers yet">
      {db.suppliers.map(s => { const ps = db.purchases.filter(p => p.supplierId === s.id); return <tr key={s.id}><Td className="font-medium">{s.name}</Td><Td>{s.city}</Td><Td className="num">{s.mobile}</Td><Td className="font-mono text-xs">{s.gstin}</Td>
        <Td className="num">{ps.length} · {inr(ps.reduce((x, p) => x + p.total, 0))}</Td><Td>{!ro && <Button size="sm" variant="ghost" onClick={() => setE(s)}>Edit</Button>}</Td></tr> })}</Table></Card>
    <Modal open={!!e} onClose={() => setE(null)} title="Supplier" footer={<><Button onClick={() => setE(null)}>Cancel</Button><Button variant="primary" onClick={() => { if (!e?.name.trim()) return toast.err('Name is needed'); api.saveSupplier(e); setE(null) }}>Save</Button></>}>
      {e && <div className="grid gap-3 sm:grid-cols-2">{(['name', 'city', 'mobile', 'gstin'] as const).map(k => <Field key={k} label={{ name: 'Name', city: 'City', mobile: 'Mobile', gstin: 'GSTIN' }[k]}><Input value={e[k]} onChange={x => setE({ ...e, [k]: x.target.value })} /></Field>)}</div>}
    </Modal>
  </>
}
