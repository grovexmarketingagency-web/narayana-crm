import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { useStore, api, currentStaff } from '../lib/store'
import { inr, dt } from '../lib/format'
import { readOnly } from '../lib/access'
import { Button, Card, Input, Select, Table, Td, PageHeader, Field, Modal, Stat, toast } from '../components/ui'
import type { PayMode } from '../lib/types'

export default function Credit() {
  const { db } = useStore(); const ro = readOnly(currentStaff()!.role)
  const [pay, setPay] = useState<string | null>(null); const [amt, setAmt] = useState(''); const [mode, setMode] = useState<PayMode>('cash')
  const dues = db.customers.filter(c => c.balance > 0).sort((a, b) => b.balance - a.balance)
  const c = db.customers.find(x => x.id === pay)
  const lastCredit = (id: string) => [...db.bills].reverse().find(b => b.customerId === id && b.payments.some(p => p.mode === 'credit'))
  return <>
    <PageHeader title="Credit & dues" sub="Pay-later sales and collections" />
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
      <Stat label="Total due" value={inr(dues.reduce((s, c) => s + c.balance, 0))} tone="danger" />
      <Stat label="Customers owing" value={dues.length} />
      <Stat label="Collected (30 days)" value={inr(db.creditPayments.filter(p => Date.now() - +new Date(p.at) < 30 * 864e5).reduce((s, p) => s + p.amount, 0))} tone="success" />
    </div>
    <Card title="Customers with a balance">
      <Table head={['Customer', 'Mobile', 'Due', 'Limit', 'Last credit bill', '']} empty="Nobody owes money right now">
        {dues.map(c => { const lb = lastCredit(c.id); const msg = `Hello ${c.name}, this is a gentle reminder from Narayana Textiles that ${inr(c.balance)} is pending on your account. Thank you!`
          return <tr key={c.id}><Td className="font-medium">{c.name}</Td><Td className="num">{c.mobile}</Td><Td className="num font-semibold text-danger">{inr(c.balance)}</Td><Td className="num text-muted">{inr(c.creditLimit)}</Td>
            <Td>{lb ? <a className="text-accent" href={'#/bills/' + lb.id}>{lb.no}</a> : '—'}</Td>
            <Td className="whitespace-nowrap"><a className="mr-2 inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-surface-2" target="_blank" rel="noreferrer" href={`https://wa.me/91${c.mobile}?text=${encodeURIComponent(msg)}`}><MessageCircle size={14} />Remind</a>
              {!ro && <Button size="sm" variant="primary" onClick={() => { setPay(c.id); setAmt(String(c.balance)) }}>Collect</Button>}</Td></tr> })}
      </Table>
    </Card>
    <Card title="Recent collections" className="mt-4"><Table head={['Date', 'Customer', 'Mode', 'Amount']} empty="No collections yet">
      {db.creditPayments.slice(0, 30).map(p => <tr key={p.id}><Td>{dt(p.at)}</Td><Td>{db.customers.find(c => c.id === p.customerId)?.name}</Td><Td className="uppercase text-xs">{p.mode}</Td><Td className="num">{inr(p.amount)}</Td></tr>)}</Table></Card>
    <Modal open={!!c} onClose={() => setPay(null)} title={`Collect from ${c?.name}`} footer={<><Button onClick={() => setPay(null)}>Cancel</Button><Button variant="primary" onClick={() => {
      const n = +amt; if (!(n > 0) || n > (c?.balance || 0)) return toast.err('Enter an amount up to the due')
      api.collectCredit(c!.id, n, mode); toast.ok(`Collected ${inr(n)}`); setPay(null)
    }}>Save payment</Button></>}>
      <p className="mb-3 text-sm text-muted">Due now: {inr(c?.balance || 0)}. Part payments are fine.</p>
      <div className="grid grid-cols-2 gap-3"><Field label="Amount"><Input type="number" value={amt} onChange={e => setAmt(e.target.value)} /></Field>
        <Field label="Mode"><Select value={mode} onChange={e => setMode(e.target.value as PayMode)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></Select></Field></div>
    </Modal>
  </>
}
