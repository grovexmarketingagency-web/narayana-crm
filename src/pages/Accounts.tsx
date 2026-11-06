import { useState } from 'react'
import { Trash2, FileSpreadsheet, FileText } from 'lucide-react'
import { useStore, api, currentStaff } from '../lib/store'
import { inr, d, dt, dayKey, localToday } from '../lib/format'
import { readOnly } from '../lib/access'
import { cashBook, balances, customerLedger, supplierLedger, supplierDue } from '../lib/ledger'
import { exportsFor } from '../lib/exports'
import { blockedDownload } from '../lib/exporter'
import { currentRoute } from '../lib/router'
import { Button, Card, Input, Select, Table, Td, PageHeader, Field, Stat, Tabs, Badge, Modal, toast } from '../components/ui'
import type { AcctMode } from '../lib/types'

type T = 'summary' | 'daybook' | 'income' | 'expenses' | 'ledger'
const EXP = ['Rent', 'Salaries', 'Electricity', 'Tea & snacks', 'Transport', 'Packing covers', 'Tailoring', 'Advertising', 'Repairs', 'Other']
const INC = ['Tailoring charges', 'Old stock sale (bulk)', 'Commission received', 'Interest', 'Other']

export default function Accounts() {
  const { db } = useStore(); const ro = readOnly(currentStaff()!.role)
  const [tab, setTab] = useState<T>(currentRoute().startsWith('/expenses') ? 'expenses' : 'summary')
  const m0 = new Date(); m0.setDate(1)
  const [from, setFrom] = useState(dayKey(m0.toISOString())); const [to, setTo] = useState(localToday())
  const [acct, setAcct] = useState<'' | AcctMode>('')
  const [f, setF] = useState({ at: localToday(), category: '', amount: '', note: '', mode: 'cash' as AcctMode })
  const [party, setParty] = useState<{ kind: 'customer' | 'supplier'; id: string }>({ kind: 'supplier', id: db.suppliers[0]?.id || '' })
  const [pay, setPay] = useState<{ id: string; amount: string; mode: AcctMode; note: string } | null>(null)
  const inR = (iso: string) => { const k = dayKey(iso); return k >= from && k <= to }
  const book = cashBook(db).filter(e => inR(e.at) && (!acct || e.account === acct))
  const bal = balances(db); const opening = balances(db, (() => { const x = new Date(from); x.setDate(x.getDate() - 1); return dayKey(x.toISOString()) })())
  const inc = db.incomes.filter(e => inR(e.at)), exp = db.expenses.filter(e => inR(e.at))
  const sales = db.bills.filter(b => inR(b.at)).reduce((s, b) => s + b.total, 0)
  const supDue = db.suppliers.reduce((s, x) => s + supplierDue(db, x.id), 0), custDue = db.customers.reduce((s, c) => s + c.balance, 0)
  const ledger = party.kind === 'customer' ? customerLedger(db, party.id) : supplierLedger(db, party.id)
  const ex = (fn: () => void) => { if (!blockedDownload(toast.err)) fn() }
  const entryForm = (kind: 'income' | 'expense') => !ro && <Card className="mb-4 p-4"><form className="grid items-end gap-3 sm:grid-cols-6" onSubmit={e => { e.preventDefault()
    if (!(+f.amount > 0) || !f.category.trim()) return toast.err('Enter a category and an amount')
    const row = { at: new Date(f.at + 'T12:00:00').toISOString(), category: f.category, amount: +f.amount, note: f.note, mode: f.mode }
    if (kind === 'income') api.addIncome(row); else api.addExpense(row); setF({ ...f, amount: '', note: '' }); toast.ok(kind === 'income' ? 'Income saved' : 'Expense saved') }}>
    <Field label="Date"><Input type="date" value={f.at} onChange={e => setF({ ...f, at: e.target.value })} /></Field>
    <Field label="Category"><Input list={kind} value={f.category} onChange={e => setF({ ...f, category: e.target.value })} /><datalist id={kind}>{(kind === 'income' ? INC : EXP).map(c => <option key={c} value={c} />)}</datalist></Field>
    <Field label="Amount (₹)"><Input type="number" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
    <Field label={kind === 'income' ? 'Received in' : 'Paid from'}><Select value={f.mode} onChange={e => setF({ ...f, mode: e.target.value as AcctMode })}><option value="cash">Cash</option><option value="bank">Bank / UPI</option></Select></Field>
    <Field label="Note"><Input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field>
    <Button variant="primary" type="submit">Add {kind}</Button></form></Card>
  return <>
    <PageHeader title="Accounts" sub="Income, expenses, cash book and party ledgers" actions={<>
      <Button onClick={() => ex(() => exportsFor.accountsExcel(db, from, to))}><FileSpreadsheet size={16} />Excel</Button>
      <Button onClick={() => ex(() => exportsFor.accountsPDF(db, from, to))}><FileText size={16} />PDF</Button></>} />
    <div className="no-print mb-4 flex flex-wrap items-end gap-3"><Field label="From"><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field><Field label="To"><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field></div>
    <Tabs value={tab} onChange={setTab} items={[{ id: 'summary', label: 'Summary' }, { id: 'daybook', label: 'Cash book' }, { id: 'income', label: 'Income' }, { id: 'expenses', label: 'Expenses' }, { id: 'ledger', label: 'Ledgers' }]} />
    {tab === 'summary' && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cash in hand" value={inr(bal.cash)} sub={`opening ${inr(db.shop.openingCash)}`} tone="success" />
        <Stat label="Bank / UPI balance" value={inr(bal.bank)} sub={`opening ${inr(db.shop.openingBank)}`} tone="success" />
        <Stat label="We owe suppliers" value={inr(supDue)} tone="danger" />
        <Stat label="Customers owe us" value={inr(custDue)} tone="accent" />
      </div>
      <Card title={`Income and expenses · ${d(from)} to ${d(to)}`} className="mt-4"><dl className="divide-y divide-border text-sm">{([['Sales (all payment modes)', sales], ['Other income', inc.reduce((s, e) => s + e.amount, 0)], ['Expenses', -exp.reduce((s, e) => s + e.amount, 0)], ['Purchases made', -db.purchases.filter(p => inR(p.at)).reduce((s, p) => s + p.total, 0)]] as [string, number][]).map(([k, v]) =>
        <div key={k} className="flex justify-between px-4 py-2.5"><dt className="text-muted">{k}</dt><dd className={`num font-medium ${v < 0 ? 'text-danger' : ''}`}>{inr(v)}</dd></div>)}</dl>
        <p className="px-4 pb-3 text-xs text-muted">Profit after cost of goods is in Reports → Profit.</p></Card>
      <Card title="Supplier balances" className="mt-4"><Table head={['Supplier', 'Balance due', '']} empty="No suppliers">{db.suppliers.map(s => { const due = supplierDue(db, s.id); return <tr key={s.id}><Td>{s.name}</Td><Td className={`num font-medium ${due > 0 ? 'text-danger' : ''}`}>{inr(due)}</Td>
        <Td className="whitespace-nowrap"><Button size="sm" variant="ghost" onClick={() => { setParty({ kind: 'supplier', id: s.id }); setTab('ledger') }}>Ledger</Button>{!ro && due > 0 && <Button size="sm" variant="primary" onClick={() => setPay({ id: s.id, amount: String(due), mode: 'bank', note: '' })}>Pay</Button>}</Td></tr> })}</Table></Card>
    </>}
    {tab === 'daybook' && <Card title={<span className="flex items-center gap-2">Cash book <Select className="h-8 w-36" value={acct} onChange={e => setAcct(e.target.value as '' | AcctMode)}><option value="">Cash + bank</option><option value="cash">Cash only</option><option value="bank">Bank / UPI only</option></Select></span>}>
      <div className="flex flex-wrap gap-4 px-4 pt-3 text-sm"><span>Opening: <b className="num">{inr(acct === 'bank' ? opening.bank : acct === 'cash' ? opening.cash : opening.cash + opening.bank)}</b></span><span className="text-success">In: <b className="num">{inr(book.reduce((s, e) => s + e.inAmt, 0))}</b></span><span className="text-danger">Out: <b className="num">{inr(book.reduce((s, e) => s + e.outAmt, 0))}</b></span></div>
      <Table head={['Date', 'Account', 'Type', 'Ref', 'Party / note', 'In', 'Out']} empty="No money moved in this range">{[...book].reverse().slice(0, 400).map((e, i) => <tr key={i}><Td className="whitespace-nowrap">{dt(e.at)}</Td><Td><Badge tone={e.account === 'cash' ? 'neutral' : 'accent'}>{e.account === 'cash' ? 'Cash' : 'Bank'}</Badge></Td><Td>{e.kind}</Td><Td className="text-xs">{e.ref}</Td><Td className="text-xs text-muted">{e.party}</Td>
        <Td className="num text-success">{e.inAmt ? inr(e.inAmt) : ''}</Td><Td className="num text-danger">{e.outAmt ? inr(e.outAmt) : ''}</Td></tr>)}</Table></Card>}
    {tab === 'income' && <>{entryForm('income')}<Card><Table head={['Date', 'Category', 'Received in', 'Note', 'Amount', '']} empty="No other income in this range">{inc.map(e => <tr key={e.id}><Td>{d(e.at)}</Td><Td>{e.category}</Td><Td>{e.mode === 'bank' ? 'Bank' : 'Cash'}</Td><Td className="text-muted">{e.note}</Td><Td className="num font-medium">{inr(e.amount)}</Td>
      <Td>{!ro && <button aria-label="Delete income" className="p-1.5 text-muted hover:text-danger" onClick={() => api.deleteIncome(e.id)}><Trash2 size={15} /></button>}</Td></tr>)}</Table></Card></>}
    {tab === 'expenses' && <>{entryForm('expense')}<Card><Table head={['Date', 'Category', 'Paid from', 'Note', 'Amount', '']} empty="No expenses in this range">{[...exp].sort((a, b) => b.at.localeCompare(a.at)).map(e => <tr key={e.id}><Td>{d(e.at)}</Td><Td>{e.category}</Td><Td>{e.mode === 'bank' ? 'Bank' : 'Cash'}</Td><Td className="text-muted">{e.note}</Td><Td className="num font-medium">{inr(e.amount)}</Td>
      <Td>{!ro && <button aria-label="Delete expense" className="p-1.5 text-muted hover:text-danger" onClick={() => api.deleteExpense(e.id)}><Trash2 size={15} /></button>}</Td></tr>)}</Table></Card></>}
    {tab === 'ledger' && <Card>
      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-3">
        <Field label="Ledger of"><Select value={party.kind} onChange={e => { const k = e.target.value as 'customer' | 'supplier'; setParty({ kind: k, id: (k === 'customer' ? db.customers.find(c => c.balance > 0) || db.customers[0] : db.suppliers[0])?.id || '' }) }}><option value="supplier">Supplier</option><option value="customer">Customer</option></Select></Field>
        <Field label={party.kind === 'customer' ? 'Customer' : 'Supplier'}><Select value={party.id} onChange={e => setParty({ ...party, id: e.target.value })}>{(party.kind === 'customer' ? db.customers : db.suppliers).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <div className="self-end pb-2 text-sm">Balance: <b className="num text-danger">{inr(ledger[ledger.length - 1]?.balance || 0)}</b> <span className="text-muted">{party.kind === 'customer' ? 'they owe us' : 'we owe them'}</span></div>
      </div>
      <Table head={['Date', 'Details', 'Ref', 'Debit', 'Credit', 'Balance']} empty="No entries for this party">{ledger.map((r, i) => <tr key={i}><Td>{d(r.at)}</Td><Td>{r.text}</Td><Td className="text-xs">{r.ref}</Td><Td className="num">{r.debit ? inr(r.debit) : ''}</Td><Td className="num">{r.credit ? inr(r.credit) : ''}</Td><Td className="num font-medium">{inr(r.balance)}</Td></tr>)}</Table>
    </Card>}
    <Modal open={!!pay} onClose={() => setPay(null)} title={`Pay ${db.suppliers.find(s => s.id === pay?.id)?.name}`} footer={<><Button onClick={() => setPay(null)}>Cancel</Button><Button variant="primary" onClick={() => { const n = +(pay?.amount || 0); if (!(n > 0)) return toast.err('Enter an amount'); api.paySupplier({ supplierId: pay!.id, amount: n, mode: pay!.mode, note: pay!.note, at: new Date().toISOString() }); toast.ok(`Paid ${inr(n)}`); setPay(null) }}>Save payment</Button></>}>
      {pay && <div className="grid gap-3 sm:grid-cols-2"><Field label="Amount (₹)"><Input type="number" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} /></Field>
        <Field label="Paid from"><Select value={pay.mode} onChange={e => setPay({ ...pay, mode: e.target.value as AcctMode })}><option value="bank">Bank / UPI</option><option value="cash">Cash</option></Select></Field>
        <Field label="Note (cheque / UTR no.)" className="sm:col-span-2"><Input value={pay.note} onChange={e => setPay({ ...pay, note: e.target.value })} /></Field></div>}
    </Modal>
  </>
}
