import { useRef, useState } from 'react'
import { Download, Upload, RotateCcw, Plus } from 'lucide-react'
import { useStore, api } from '../lib/store'
import { dt, uid, localToday } from '../lib/format'
import { Button, Card, Input, Select, Table, Td, Badge, PageHeader, Field, Modal, Tabs, Textarea, toast } from '../components/ui'
import type { Staff, Shop, Role } from '../lib/types'
import { PAGES, ROLES } from '../lib/access'

export default function SettingsPage() {
  const { db } = useStore()
  const [tab, setTab] = useState<'shop' | 'gst' | 'staff' | 'perm' | 'log' | 'data'>('shop')
  const [shop, setShop] = useState<Shop>(db.shop)
  const [st, setSt] = useState<Staff | null>(null); const [reset, setReset] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const set = (k: keyof Shop, v: string | number) => setShop({ ...shop, [k]: v })
  const save = () => { api.saveShop(shop); toast.ok('Settings saved') }
  return <>
    <PageHeader title="Settings & staff" />
    <Tabs value={tab} onChange={setTab} items={[{ id: 'shop', label: 'Shop & bill' }, { id: 'gst', label: 'GST, loyalty & opening balances' }, { id: 'staff', label: 'Staff & PINs' }, { id: 'perm', label: 'Role permissions' }, { id: 'log', label: 'Change history' }, { id: 'data', label: 'Backup & export' }]} />
    {tab === 'shop' && <Card className="max-w-3xl p-5"><div className="grid gap-3 sm:grid-cols-2">
      <Field label="Shop name"><Input value={shop.name} onChange={e => set('name', e.target.value)} /></Field><Field label="Tagline"><Input value={shop.tagline} onChange={e => set('tagline', e.target.value)} /></Field>
      <Field label="Address" className="sm:col-span-2"><Input value={shop.address} onChange={e => set('address', e.target.value)} /></Field>
      <Field label="Phone"><Input value={shop.phone} onChange={e => set('phone', e.target.value)} /></Field><Field label="GSTIN"><Input value={shop.gstin} onChange={e => set('gstin', e.target.value.toUpperCase())} /></Field>
      <Field label="State"><Input value={shop.stateName} onChange={e => set('stateName', e.target.value)} /></Field>
      <Field label="Screen & bill language" hint="Malayalam and Tamil labels are planned"><Select value={shop.language} onChange={e => set('language', e.target.value)}><option value="en">English</option><option value="ml">മലയാളം (Malayalam)</option><option value="ta">தமிழ் (Tamil)</option></Select></Field>
      <Field label="Thermal printer paper"><Select value={shop.printerWidth} onChange={e => set('printerWidth', e.target.value)}><option value="80">80 mm (3 inch)</option><option value="58">58 mm (2 inch)</option></Select></Field>
      <Field label="Label code"><Select value={shop.labelCode} onChange={e => set('labelCode', e.target.value)}><option value="barcode">Barcode (Code 128, any scanner gun)</option><option value="qr">QR code</option></Select></Field>
      <Field label="Bill footer" className="sm:col-span-2"><Textarea rows={2} value={shop.billFooter} onChange={e => set('billFooter', e.target.value)} /></Field>
    </div><Button variant="primary" className="mt-4" onClick={save}>Save</Button></Card>}
    {tab === 'gst' && <Card className="max-w-3xl p-5"><div className="grid gap-3 sm:grid-cols-3">
      <Field label="Garment threshold (₹/piece)" hint="checked on price after discount"><Input type="number" value={shop.garmentThreshold} onChange={e => set('garmentThreshold', +e.target.value)} /></Field>
      <Field label="Garment GST up to threshold %"><Input type="number" value={shop.garmentLow} onChange={e => set('garmentLow', +e.target.value)} /></Field>
      <Field label="Garment GST above threshold %"><Input type="number" value={shop.garmentHigh} onChange={e => set('garmentHigh', +e.target.value)} /></Field>
      <Field label="Fabric GST %"><Input type="number" value={shop.fabricRate} onChange={e => set('fabricRate', +e.target.value)} /></Field>
      <Field label="Other items GST %"><Input type="number" value={shop.otherRate} onChange={e => set('otherRate', +e.target.value)} /></Field><div />
      <Field label="Loyalty points per ₹100"><Input type="number" value={shop.pointsPer100} onChange={e => set('pointsPer100', +e.target.value)} /></Field>
      <Field label="Value of 1 point (₹)"><Input type="number" step="0.1" value={shop.pointValue} onChange={e => set('pointValue', +e.target.value)} /></Field>
      <Field label="Default low-stock alert"><Input type="number" value={shop.lowStockDefault} onChange={e => set('lowStockDefault', +e.target.value)} /></Field>
      <Field label="Opening cash in hand (₹)"><Input type="number" value={shop.openingCash} onChange={e => set('openingCash', +e.target.value)} /></Field>
      <Field label="Opening bank balance (₹)"><Input type="number" value={shop.openingBank} onChange={e => set('openingBank', +e.target.value)} /></Field>
    </div><p className="mt-3 text-xs text-muted">Check GST rates with your accountant whenever the government revises them.</p><Button variant="primary" className="mt-4" onClick={save}>Save</Button></Card>}
    {tab === 'staff' && <Card title="Staff" action={<Button size="sm" variant="primary" onClick={() => setSt({ id: uid(), name: '', role: 'cashier', pin: '', maxDiscountPct: 5, active: true })}><Plus size={14} />Add staff</Button>}>
      <Table head={['Name', 'Role', 'Max discount', 'Status', '']}>{db.staff.map(s => <tr key={s.id}><Td className="font-medium">{s.name}</Td><Td className="capitalize">{s.role}</Td><Td>{s.maxDiscountPct}%</Td><Td>{s.active ? <Badge tone="success">Active</Badge> : <Badge>Disabled</Badge>}</Td><Td><Button size="sm" variant="ghost" onClick={() => setSt(s)}>Edit</Button></Td></tr>)}</Table>
      <div className="p-4 text-xs text-muted">Owner: everything. Manager: all but settings. Cashier: billing, customers, alterations, returns. Accountant: read-only bills, purchases, expenses, reports and GST.</div></Card>}
    {tab === 'perm' && <Card title="Which screens each role can open">
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th className="px-4 py-2">Screen</th>{ROLES.map(r => <th key={r} className="px-4 py-2 capitalize">{r}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{PAGES.map(p => <tr key={p.path}><td className="px-4 py-2">{p.label}</td>{ROLES.map(r => { const on = r === 'owner' || db.permissions[r].includes(p.path)
          return <td key={r} className="px-4 py-2"><input type="checkbox" aria-label={`${r} can open ${p.label}`} checked={on} disabled={r === 'owner'}
            onChange={e => api.savePermissions(r as Role, e.target.checked ? [...db.permissions[r], p.path] : db.permissions[r].filter(x => x !== p.path))} /></td> })}</tr>)}</tbody></table></div>
      <p className="p-4 text-xs text-muted">The owner always has every screen. Accountants are read-only wherever they have access. Discount limits are set per person under Staff & PINs.</p></Card>}
    {tab === 'log' && <Card><Table head={['When', 'Who', 'What', 'Detail']} empty="Nothing logged yet">{db.audit.slice(0, 200).map(a => <tr key={a.id}><Td className="whitespace-nowrap">{dt(a.at)}</Td><Td>{db.staff.find(s => s.id === a.staffId)?.name}</Td><Td><Badge>{a.action}</Badge></Td><Td className="text-sm">{a.detail}</Td></tr>)}</Table></Card>}
    {tab === 'data' && <Card className="max-w-2xl p-5"><p className="mb-4 text-sm text-muted">Excel/PDF exports, scheduled backups and restoring older backups are on the <a className="text-accent" href="#/backup">Backup & export</a> screen.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => { const blob = new Blob([api.exportJSON()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `narayana-backup-${localToday()}.json`; a.click() }}><Download size={16} />Download backup</Button>
        <input ref={file} type="file" accept="application/json" hidden onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { await api.importJSON(await f.text()); toast.ok('Backup restored') } catch (err) { toast.err(String((err as Error).message)) } e.target.value = '' }} />
        <Button onClick={() => file.current?.click()}><Upload size={16} />Restore backup</Button>
        <Button variant="danger" onClick={() => setReset(true)}><RotateCcw size={16} />Reset to demo data</Button></div></Card>}
    <Modal open={!!st} onClose={() => setSt(null)} title="Staff member" footer={<><Button onClick={() => setSt(null)}>Cancel</Button><Button variant="primary" onClick={() => { const isNew = !db.staff.some(s => s.id === st?.id); if (!st?.name.trim()) return toast.err('Give the staff member a name'); if ((isNew || st.pin) && !/^\d{4,6}$/.test(st.pin || '')) return toast.err(isNew ? 'A new staff member needs a 4–6 digit PIN' : 'PIN must be 4–6 digits (or leave it empty to keep the old one)'); if (st.pin && db.staff.some(s => s.pin && s.pin === st.pin && s.id !== st.id)) return toast.err('That PIN is already used'); if (api.saveStaff(st)) setSt(null) }}>Save</Button></>}>
      {st && <div className="grid gap-3 sm:grid-cols-2"><Field label="Name"><Input value={st.name} onChange={e => setSt({ ...st, name: e.target.value })} /></Field>
        <Field label="Role"><Select value={st.role} onChange={e => setSt({ ...st, role: e.target.value as Staff['role'] })}><option value="owner">Owner</option><option value="manager">Manager</option><option value="cashier">Cashier</option><option value="accountant">Accountant (read-only)</option></Select></Field>
        <Field label={db.staff.some(s => s.id === st.id) ? 'New PIN (leave empty to keep the current one)' : 'PIN (4–6 digits)'}><Input inputMode="numeric" value={st.pin || ''} onChange={e => setSt({ ...st, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></Field>
        <Field label="Max discount without owner PIN (%)"><Input type="number" value={st.maxDiscountPct} onChange={e => setSt({ ...st, maxDiscountPct: +e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={st.active} onChange={e => setSt({ ...st, active: e.target.checked })} />Can log in</label></div>}
    </Modal>
    <Modal open={reset} onClose={() => setReset(false)} title="Reset to demo data?" footer={<><Button onClick={() => setReset(false)}>Keep my data</Button><Button variant="danger" onClick={() => { api.resetDemo(); setReset(false); toast.ok('Demo data loaded') }}>Erase and reset</Button></>}>
      <p className="text-sm">All bills, customers and stock on this device will be replaced with sample data. Download a backup first if you need it.</p></Modal>
  </>
}
