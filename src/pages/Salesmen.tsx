import { useState } from 'react'
import { Plus, Printer } from 'lucide-react'
import { useStore, api } from '../lib/store'
import { inr, uid, localToday } from '../lib/format'
import { printPage } from '../lib/format'
import { Button, Card, Input, Table, Td, Badge, PageHeader, Field, Modal, toast } from '../components/ui'
import { QR } from './Labels'
import type { Salesman } from '../lib/types'

export default function Salesmen() {
  const { db } = useStore()
  const [e, setE] = useState<Salesman | null>(null); const [cards, setCards] = useState(false)
  const month = localToday().slice(0, 7); const [m, setM] = useState(month)
  const stats = (id: string) => { let pcs = 0, amt = 0, bills = 0
    db.bills.filter(b => b.at.slice(0, 7) === m).forEach(b => { const ls = b.lines.filter(l => (l.salesmanId || b.salesmanId) === id); if (ls.length) bills++; ls.forEach(l => { pcs += l.unit === 'm' ? 1 : l.qty; amt += l.net }) })
    return { pcs, amt, bills } }
  const rows = db.salesmen.map(s => ({ s, ...stats(s.id) })).sort((a, b) => b.amt - a.amt)
  return <>
    <PageHeader title="Salesmen" sub="Scan a salesman's card on the bill. Points and commission are counted for every piece they sell." actions={<>
      <Button onClick={() => setCards(true)}><Printer size={16} />Print code cards</Button>
      <Button variant="primary" onClick={() => setE({ id: uid(), code: 'SM' + String(db.salesmen.length + 1).padStart(2, '0'), name: '', pointsPerPiece: 2, commissionPct: 1, active: true })}><Plus size={16} />Add salesman</Button></>} />
    <Card title="Leaderboard" action={<Input type="month" className="h-8 w-40" value={m} onChange={x => setM(x.target.value)} />}>
      <Table head={['#', 'Salesman', 'Code', 'Bills', 'Pieces', 'Sales', 'Points', 'Commission', '']}>
        {rows.map((r, i) => <tr key={r.s.id}><Td>{i + 1}</Td><Td className="font-medium">{r.s.name} {!r.s.active && <Badge>inactive</Badge>}</Td><Td className="font-mono">{r.s.code}</Td><Td>{r.bills}</Td><Td className="num">{r.pcs}</Td>
          <Td className="num">{inr(r.amt)}</Td><Td className="num font-medium text-gold">{r.pcs * r.s.pointsPerPiece}</Td><Td className="num font-medium">{inr(r.amt * r.s.commissionPct / 100)}</Td>
          <Td><Button size="sm" variant="ghost" onClick={() => setE(r.s)}>Edit</Button></Td></tr>)}</Table></Card>
    <Modal open={!!e} onClose={() => setE(null)} title="Salesman" footer={<><Button onClick={() => setE(null)}>Cancel</Button><Button variant="primary" onClick={() => { if (!e?.name.trim()) return toast.err('Name is needed'); if (db.salesmen.some(s => s.code === e.code && s.id !== e.id)) return toast.err('Code already used'); api.saveSalesman(e); setE(null) }}>Save</Button></>}>
      {e && <div className="grid gap-3 sm:grid-cols-2"><Field label="Name"><Input value={e.name} onChange={x => setE({ ...e, name: x.target.value })} /></Field><Field label="Card code"><Input value={e.code} onChange={x => setE({ ...e, code: x.target.value.toUpperCase() })} /></Field>
        <Field label="Points per piece"><Input type="number" value={e.pointsPerPiece} onChange={x => setE({ ...e, pointsPerPiece: +x.target.value })} /></Field><Field label="Commission % of sales"><Input type="number" step="0.1" value={e.commissionPct} onChange={x => setE({ ...e, commissionPct: +x.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={e.active} onChange={x => setE({ ...e, active: x.target.checked })} />Active</label></div>}
    </Modal>
    <Modal open={cards} onClose={() => setCards(false)} wide title="Salesman code cards" footer={<Button variant="primary" onClick={() => printPage(toast.err)}><Printer size={16} />Print</Button>}>
      <div className="print-area grid grid-cols-2 gap-3 bg-white sm:grid-cols-3">{db.salesmen.filter(s => s.active).map(s => <div key={s.id} className="flex flex-col items-center gap-1 rounded-md border border-gray-300 p-3 text-black">
        <div className="text-[10px] font-bold uppercase tracking-widest">{db.shop.name}</div><QR text={s.code} size={90} /><div className="font-semibold">{s.name}</div><div className="font-mono text-xs">{s.code}</div></div>)}</div>
    </Modal>
  </>
}
