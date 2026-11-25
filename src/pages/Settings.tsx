import { useEffect, useRef, useState } from 'react'
import { Download, Upload, RotateCcw, Plus } from 'lucide-react'
import QRCode from 'qrcode'
import { useStore, api, serverApi, storeMode, currentStaff, syncNow } from '../lib/store'
import { dt, uid, localToday } from '../lib/format'
import { Button, Card, Input, Select, Table, Td, Badge, PageHeader, Field, Modal, Tabs, Textarea, toast } from '../components/ui'
import type { Staff, Shop, Role } from '../lib/types'
import { PAGES, ROLES } from '../lib/access'
import { freeSectionCode } from '../lib/codes'

/** shrink a picture to 360 px wide and make it black & white, so it stays small and prints well on a thermal bill */
async function toLogo(f: File): Promise<string> {
  const img = await createImageBitmap(f); const w = Math.min(360, img.width), h = Math.max(1, Math.round(img.height * w / img.width))
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h)
  const d = x.getImageData(0, 0, w, h); for (let i = 0; i < d.data.length; i += 4) { const v = (d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11) < 150 ? 0 : 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255 }
  x.putImageData(d, 0, 0); return c.toDataURL('image/png')
}

export default function SettingsPage() {
  const { db } = useStore()
  const [tab, setTab] = useState<'shop' | 'sections' | 'gst' | 'staff' | 'perm' | 'log' | 'data'>('shop')
  const [shop, setShop] = useState<Shop>(db.shop)
  const [st, setSt] = useState<Staff | null>(null); const [reset, setReset] = useState(false); const [fresh, setFresh] = useState(false); const [freshPin, setFreshPin] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const set = (k: keyof Shop, v: string | number) => setShop({ ...shop, [k]: v })
  const save = () => { api.saveShop(shop); toast.ok('Settings saved') }
  return <>
    <PageHeader title="Settings & staff" />
    <Tabs value={tab} onChange={setTab} items={[{ id: 'shop', label: 'Shop & bill' }, { id: 'sections', label: 'Sections' }, { id: 'gst', label: 'Loyalty & opening balances' }, { id: 'staff', label: 'Staff & PINs' }, { id: 'perm', label: 'Role permissions' }, { id: 'log', label: 'Change history' }, { id: 'data', label: 'Backup & export' }]} />
    {tab === 'shop' && <Card className="max-w-3xl p-5"><div className="grid gap-3 sm:grid-cols-2">
      <Field label="Shop name"><Input value={shop.name} onChange={e => set('name', e.target.value)} /></Field><Field label="Tagline"><Input value={shop.tagline} onChange={e => set('tagline', e.target.value)} /></Field>
      <Field label="Address" className="sm:col-span-2"><Input value={shop.address} onChange={e => set('address', e.target.value)} /></Field>
      <Field label="Phone"><Input value={shop.phone} onChange={e => set('phone', e.target.value)} /></Field><div />
      <Field label="Logo (printed on the bill)" className="sm:col-span-2" hint="Any picture. It is made black & white so it prints clearly."><div className="flex items-center gap-3">{shop.logo && <img src={shop.logo} alt="" className="h-14 rounded border border-border bg-white p-1" />}
        <input type="file" accept="image/*" onChange={async e => { const f = e.target.files?.[0]; if (f) { try { set('logo', await toLogo(f)) } catch { toast.err('Could not read that picture') } } e.target.value = '' }} />{shop.logo && <Button onClick={() => setShop({ ...shop, logo: undefined })}>Remove</Button>}</div></Field>
      <Field label="State"><Input value={shop.stateName} onChange={e => set('stateName', e.target.value)} /></Field>
      <Field label="Screen & bill language" hint="Menu, billing buttons and the printed bill. First draft: please have staff check the words."><Select value={shop.language} onChange={e => set('language', e.target.value)}><option value="en">English</option><option value="ml">മലയാളം (Malayalam)</option><option value="ta">தமிழ் (Tamil)</option></Select></Field>
      <Field label="Thermal printer paper"><Select value={shop.printerWidth} onChange={e => set('printerWidth', e.target.value)}><option value="80">80 mm (3 inch)</option><option value="58">58 mm (2 inch)</option></Select></Field>
      <Field label="Label code"><Select value={shop.labelCode} onChange={e => set('labelCode', e.target.value)}><option value="barcode">Barcode (Code 128, any scanner gun)</option><option value="qr">QR code</option></Select></Field>
      <Field label="Bill footer" className="sm:col-span-2"><Textarea rows={2} value={shop.billFooter} onChange={e => set('billFooter', e.target.value)} /></Field>
    </div><Button variant="primary" className="mt-4" onClick={save}>Save</Button></Card>}
    {tab === 'sections' && <SectionsTab />}
    {tab === 'gst' && <Card className="max-w-3xl p-5"><div className="grid gap-3 sm:grid-cols-3">
      <Field label="Loyalty points per ₹100"><Input type="number" value={shop.pointsPer100} onChange={e => set('pointsPer100', +e.target.value)} /></Field>
      <Field label="Value of 1 point (₹)"><Input type="number" step="0.1" value={shop.pointValue} onChange={e => set('pointValue', +e.target.value)} /></Field>
      <Field label="Default low-stock alert"><Input type="number" value={shop.lowStockDefault} onChange={e => set('lowStockDefault', +e.target.value)} /></Field>
      <Field label="Opening cash in hand (₹)"><Input type="number" value={shop.openingCash} onChange={e => set('openingCash', +e.target.value)} /></Field>
      <Field label="Opening bank balance (₹)"><Input type="number" value={shop.openingBank} onChange={e => set('openingBank', +e.target.value)} /></Field>
    </div><Button variant="primary" className="mt-4" onClick={save}>Save</Button></Card>}
    {tab === 'staff' && <Card title="Staff" action={<Button size="sm" variant="primary" onClick={() => setSt({ id: uid(), name: '', role: 'cashier', pin: '', maxDiscountPct: 5, active: true })}><Plus size={14} />Add staff</Button>}>
      <Table head={['Name', 'Role', 'Max discount', 'Status', '']}>{db.staff.map(s => <tr key={s.id}><Td className="font-medium">{s.name}</Td><Td className="capitalize">{s.role}</Td><Td>{s.maxDiscountPct}%</Td><Td>{s.active ? <Badge tone="success">Active</Badge> : <Badge>Disabled</Badge>}</Td><Td><Button size="sm" variant="ghost" onClick={() => setSt(s)}>Edit</Button></Td></tr>)}</Table>
      <div className="p-4 text-xs text-muted">Owner: everything. Manager: all but settings. Cashier: billing, customers, alterations, returns. Accountant: read-only bills, purchases, expenses, reports and GST.</div></Card>}
    {tab === 'staff' && storeMode() === 'server' && currentStaff()?.role === 'owner' && <TwoStep />}
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
        {storeMode() === 'local' && <Button variant="danger" onClick={() => { setFreshPin(''); setFresh(true) }}><RotateCcw size={16} />Start fresh (remove demo data)</Button>}
        <Button variant="danger" onClick={() => setReset(true)}><RotateCcw size={16} />Reset to demo data</Button></div></Card>}
    <Modal open={!!st} onClose={() => setSt(null)} title="Staff member" footer={<><Button onClick={() => setSt(null)}>Cancel</Button><Button variant="primary" onClick={() => { const isNew = !db.staff.some(s => s.id === st?.id); if (!st?.name.trim()) return toast.err('Give the staff member a name'); if ((isNew || st.pin) && !/^\d{4,6}$/.test(st.pin || '')) return toast.err(isNew ? 'A new staff member needs a 4–6 digit PIN' : 'PIN must be 4–6 digits (or leave it empty to keep the old one)'); if (st.pin && db.staff.some(s => s.pin && s.pin === st.pin && s.id !== st.id)) return toast.err('That PIN is already used'); if (api.saveStaff(st)) setSt(null) }}>Save</Button></>}>
      {st && <div className="grid gap-3 sm:grid-cols-2"><Field label="Name"><Input value={st.name} onChange={e => setSt({ ...st, name: e.target.value })} /></Field>
        <Field label="Role"><Select value={st.role} onChange={e => setSt({ ...st, role: e.target.value as Staff['role'] })}><option value="owner">Owner</option><option value="manager">Manager</option><option value="cashier">Cashier</option><option value="accountant">Accountant (read-only)</option></Select></Field>
        <Field label={db.staff.some(s => s.id === st.id) ? 'New PIN (leave empty to keep the current one)' : 'PIN (4–6 digits)'}><Input inputMode="numeric" value={st.pin || ''} onChange={e => setSt({ ...st, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></Field>
        <Field label="Max discount without owner PIN (%)"><Input type="number" value={st.maxDiscountPct} onChange={e => setSt({ ...st, maxDiscountPct: +e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={st.active} onChange={e => setSt({ ...st, active: e.target.checked })} />Can log in</label></div>}
    </Modal>
    <Modal open={fresh} onClose={() => setFresh(false)} title="Start fresh with an empty shop?" footer={<><Button onClick={() => setFresh(false)}>Keep my data</Button><Button variant="danger" disabled={!/^\d{4,8}$/.test(freshPin)} onClick={() => { api.startFresh(freshPin); setFresh(false) }}>Erase everything and start</Button></>}>
      <p className="mb-3 text-sm">All demo products, bills, customers and staff on this computer are removed. You will be signed out and log in as Owner with the new PIN. Download a backup first if you need anything.</p>
      <Field label="New owner PIN (4 to 8 digits)"><Input type="password" inputMode="numeric" value={freshPin} onChange={e => setFreshPin(e.target.value.replace(/\D/g, ''))} /></Field></Modal>
    <Modal open={reset} onClose={() => setReset(false)} title="Reset to demo data?" footer={<><Button onClick={() => setReset(false)}>Keep my data</Button><Button variant="danger" onClick={() => { api.resetDemo(); setReset(false); toast.ok('Demo data loaded') }}>Erase and reset</Button></>}>
      <p className="text-sm">All bills, customers and stock on this device will be replaced with sample data. Download a backup first if you need it.</p></Modal>
  </>
}

/** owner only: turn on a second check at login, a 6-digit code from an authenticator app on the owner's phone */
function TwoStep() {
  const { db } = useStore()
  const meNow = currentStaff()
  const on = !!db.staff.find(s => s.id === meNow?.id)?.twoStep
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null)
  const [qr, setQr] = useState(''); const [code, setCode] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { if (setup) void QRCode.toDataURL(setup.uri, { margin: 1, width: 200 }).then(setQr); else setQr('') }, [setup])
  const run = async (f: () => Promise<unknown>, okMsg: string) => {
    setBusy(true)
    try { await f(); toast.ok(okMsg); setSetup(null); setCode(''); void syncNow() } catch (e) { toast.err(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const codeInput = <div className="w-40 shrink-0"><Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" aria-label="6-digit code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} className="num text-center tracking-widest" /></div>
  return <Card title="Two-step login for the owner" className="mt-4 max-w-3xl"><div className="space-y-3 p-5 text-sm">
    <p className="text-muted">With this on, the owner logs in with the PIN <b>and</b> a 6-digit code from an authenticator app on the owner's phone (Google Authenticator, Microsoft Authenticator). Someone who learns the PIN still cannot open the owner's screens.</p>
    {on ? <>
      <p><Badge tone="success">On</Badge> To turn it off, type a code from the app.</p>
      <div className="flex gap-2">{codeInput}<Button disabled={busy || code.length !== 6} onClick={() => run(() => serverApi.twoStepDisable(code), 'Two-step login turned off')}>Turn off</Button></div>
    </> : setup ? <>
      <ol className="list-decimal space-y-1 pl-5"><li>Open the authenticator app and add an account by scanning this QR code.</li><li>If the camera does not work, type this key instead: <span className="num select-all font-semibold">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</span></li><li>Type the 6-digit code the app shows.</li></ol>
      {qr && <img src={qr} alt="QR code for the authenticator app" width={200} height={200} className="rounded-md border border-border bg-white p-1" />}
      <div className="flex gap-2">{codeInput}<Button variant="primary" disabled={busy || code.length !== 6} onClick={() => run(() => serverApi.twoStepEnable(code), 'Two-step login is on')}>Turn on</Button><Button variant="ghost" onClick={() => { setSetup(null); setCode('') }}>Cancel</Button></div>
    </> : <Button variant="primary" disabled={busy} onClick={async () => { setBusy(true); try { setSetup(await serverApi.twoStepSetup()) } catch (e) { toast.err(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) } }}>Set up two-step login</Button>}
  </div></Card>
}

/** the owner's list of shop sections (Sarees, Kurtis…). Each has a short code that starts its barcodes. */
function SectionsTab() {
  const { db } = useStore()
  const [rows, setRows] = useState(() => db.shop.sections.map(s => ({ ...s, was: s.name })))
  const [paste, setPaste] = useState(''); const [busy, setBusy] = useState(false)
  const used = (name: string) => db.products.filter(p => p.category === name).length
  const set = (i: number, k: 'name' | 'code', v: string) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: k === 'code' ? v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) : v } : r))
  const addList = () => {
    const names = paste.split(/\r?\n|,/).map(x => x.trim()).filter(Boolean); const next = [...rows]
    for (const n of names) if (!next.some(r => r.name.toLowerCase() === n.toLowerCase())) next.push({ name: n, code: freeSectionCode(next, n), was: '' })
    setRows(next); setPaste('')
  }
  const dirty = JSON.stringify(rows.map(({ name, code }) => ({ name, code }))) !== JSON.stringify(db.shop.sections)
  const save = async () => {
    const clean = rows.map(r => ({ name: r.name.trim(), code: r.code.trim(), ...(r.was ? { was: r.was } : {}) })).filter(r => r.name)
    if (clean.some(r => !/^[A-Z0-9]{2,4}$/.test(r.code))) return toast.err('Each section needs a code of 2 to 4 letters or digits')
    setBusy(true); const r = api.saveSections(clean); setBusy(false)
    if (r === false) return
    toast.ok('Sections saved'); setRows(clean.map(x => ({ name: x.name, code: x.code, was: x.name })))
  }
  return <Card className="max-w-3xl p-5">
    <p className="mb-4 text-sm text-muted">Add the sections of your shop here, once. When you add a product you pick one of these. New barcodes start with the section's code, for example <b>SAR</b>300125 for Sarees. Barcodes already printed keep working.</p>
    <div className="space-y-2">{rows.map((r, i) => <div key={i} className="flex items-center gap-2">
      <Input aria-label="Section name" className="flex-1" value={r.name} placeholder="Section name" onChange={e => set(i, 'name', e.target.value)} />
      <div className="w-24 shrink-0"><Input aria-label="Barcode code" className="num text-center uppercase" value={r.code} placeholder="Code" onChange={e => set(i, 'code', e.target.value)} /></div>
      <span className="w-20 shrink-0 text-xs text-muted">{r.was ? `${used(r.was)} products` : 'new'}</span>
      <Button size="sm" variant="ghost" disabled={!!r.was && used(r.was) > 0} title={r.was && used(r.was) > 0 ? 'Move its products to another section first' : 'Remove'} onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}>Remove</Button></div>)}
      {!rows.length && <p className="rounded-md bg-surface-2 p-3 text-sm text-muted">No sections yet. Paste your list below, or add them one by one.</p>}</div>
    <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" onClick={() => setRows([...rows, { name: '', code: '', was: '' }])}><Plus size={14} />Add a section</Button></div>
    <div className="mt-5 border-t border-border pt-4"><Field label="Have a list? Paste it here, one section per line"><Textarea rows={4} value={paste} onChange={e => setPaste(e.target.value)} placeholder={'Sarees\nKurtis\nMen\'s Wear'} /></Field>
      <Button size="sm" className="mt-2" disabled={!paste.trim()} onClick={addList}>Add these to the list</Button></div>
    <div className="mt-5 flex items-center gap-3 border-t border-border pt-4"><Button variant="primary" disabled={!dirty || busy} onClick={save}>Save sections</Button>{dirty && <span className="text-xs text-warning">Not saved yet</span>}</div>
  </Card>
}
