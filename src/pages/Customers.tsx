import { useState } from 'react'
import { UserPlus, Download, Cake } from 'lucide-react'
import { useStore, api } from '../lib/store'
import { inr, d, dt, downloadCSV } from '../lib/format'
import { Button, Card, Input, Table, Td, Badge, PageHeader, Field, Modal } from '../components/ui'
import type { Customer } from '../lib/types'

export default function Customers() {
  const { db } = useStore()
  const [q, setQ] = useState(''); const [edit, setEdit] = useState<Partial<Customer> | null>(null); const [view, setView] = useState<string | null>(null)
  const stats = (id: string) => { const bs = db.bills.filter(b => b.customerId === id); return { n: bs.length, spent: bs.reduce((s, b) => s + b.total, 0), last: bs[bs.length - 1]?.at } }
  const list = db.customers.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.mobile.includes(q))
  const month = String(new Date().getMonth() + 1).padStart(2, '0')
  const bdays = db.customers.filter(c => c.birthday?.slice(5, 7) === month)
  const v = db.customers.find(c => c.id === view)
  return <>
    <PageHeader title="Customers" sub={`${db.customers.length} customers · ${db.customers.reduce((s, c) => s + c.points, 0)} loyalty points outstanding`} actions={<>
      <Button onClick={() => downloadCSV('customers.csv', [['Name', 'Mobile', 'City', 'Points', 'Due', 'Bills', 'Spent'], ...db.customers.map(c => { const s = stats(c.id); return [c.name, c.mobile, c.city || '', c.points, c.balance, s.n, s.spent] })])}><Download size={16} />Export</Button>
      <Button variant="primary" onClick={() => setEdit({ creditLimit: 5000 })}><UserPlus size={16} />Add customer</Button></>} />
    {bdays.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm"><Cake size={16} className="text-gold" />Birthdays this month: {bdays.map(c => <span key={c.id} className="font-medium">{c.name} ({c.birthday?.slice(8)})</span>)}</div>}
    <Card>
      <div className="border-b border-border p-4"><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or mobile" className="max-w-sm" /></div>
      <Table head={['Name', 'Mobile', 'Bills', 'Total spent', 'Points', 'Due', '']} empty="No customers yet. Add one, or pick one while billing.">
        {list.map(c => { const s = stats(c.id); return <tr key={c.id} className="hover:bg-surface-2">
          <Td><button className="font-medium text-accent" onClick={() => setView(c.id)}>{c.name}</button><div className="text-xs text-muted">{c.city}</div></Td><Td className="num">{c.mobile}</Td><Td>{s.n}</Td>
          <Td className="num">{inr(s.spent)}</Td><Td><Badge tone="accent">{c.points}</Badge></Td><Td>{c.balance > 0 ? <span className="num font-medium text-danger">{inr(c.balance)}</span> : '—'}</Td>
          <Td><Button size="sm" variant="ghost" onClick={() => setEdit(c)}>Edit</Button></Td></tr> })}
      </Table>
    </Card>
    <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit customer' : 'New customer'} footer={<><Button onClick={() => setEdit(null)}>Cancel</Button>
      <Button variant="primary" onClick={() => {
        if (!edit?.name?.trim() || !/^\d{10}$/.test(edit.mobile || '')) return alertBad()
        if (db.customers.some(c => c.mobile === edit.mobile && c.id !== edit.id)) return alertBad('This mobile is already saved')
        api.upsertCustomer(edit as Customer); setEdit(null)
      }}>Save</Button></>}>
      {edit && <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={edit.name || ''} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
        <Field label="Mobile (10 digits)"><Input inputMode="tel" value={edit.mobile || ''} onChange={e => setEdit({ ...edit, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} /></Field>
        <Field label="City"><Input value={edit.city || ''} onChange={e => setEdit({ ...edit, city: e.target.value })} /></Field>
        <Field label="Birthday"><Input type="date" value={edit.birthday || ''} onChange={e => setEdit({ ...edit, birthday: e.target.value })} /></Field>
        <Field label="Credit limit (₹)"><Input type="number" value={edit.creditLimit ?? 0} onChange={e => setEdit({ ...edit, creditLimit: +e.target.value })} /></Field>
      </div>}
      <p id="cust-err" className="mt-2 text-sm text-danger" />
    </Modal>
    <Modal open={!!v} onClose={() => setView(null)} title={v?.name || ''} wide>
      {v && <><div className="mb-4 grid grid-cols-3 gap-3 text-sm"><div><div className="text-muted">Mobile</div>{v.mobile}</div><div><div className="text-muted">Points</div>{v.points}</div><div><div className="text-muted">Due / limit</div>{inr(v.balance)} / {inr(v.creditLimit)}</div></div>
        <h3 className="mb-2 text-sm font-semibold">Purchase history</h3>
        <Table head={['Bill', 'Date', 'Items', 'Total']} empty="No purchases yet">{db.bills.filter(b => b.customerId === v.id).reverse().map(b => <tr key={b.id}><Td><a className="text-accent" href={'#/bills/' + b.id}>{b.no}</a></Td><Td>{dt(b.at)}</Td>
          <Td className="max-w-xs truncate">{b.lines.map(l => l.productName).join(', ')}</Td><Td className="num">{inr(b.total)}</Td></tr>)}</Table>
        <p className="mt-3 text-xs text-muted">Customer since {d(v.createdAt)}</p></>}
    </Modal>
  </>
}
function alertBad(msg = 'Enter a name and a 10-digit mobile') { const el = document.getElementById('cust-err'); if (el) el.textContent = msg }
