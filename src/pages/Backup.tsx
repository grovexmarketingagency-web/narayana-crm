import { useEffect, useRef, useState } from 'react'
import { Download, Upload, FileSpreadsheet, FileText, FolderOpen, ShieldCheck, Server, History } from 'lucide-react'
import { useStore, api, serverApi } from '../lib/store'
import { dayKey, localToday, dt } from '../lib/format'
import { exportsFor } from '../lib/exports'
import { blockedDownload } from '../lib/exporter'
import { backupNow, listSnaps, getSnap, folderSupported, pickFolder, getFolder, folderReady, lastBackup, type Snap } from '../lib/backup'
import { Button, Card, Input, Field, Badge, PageHeader, Select, Modal, toast } from '../components/ui'

function Row({ title, sub, tags, children }: { title: string; sub: string; tags: string[]; children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
    <div className="min-w-0"><div className="flex items-center gap-2 font-medium">{title}{tags.map(t => <Badge key={t} tone={t === 'Excel' ? 'success' : 'accent'}>{t}</Badge>)}</div><div className="text-sm text-muted">{sub}</div></div>
    <div className="flex flex-wrap gap-2">{children}</div></div>
}
function saveText(name: string, text: string) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000) }

export default function Backup() {
  const { db, sync } = useStore()
  const m0 = new Date(); m0.setDate(1)
  const [from, setFrom] = useState(dayKey(m0.toISOString())); const [to, setTo] = useState(localToday())
  const [snaps, setSnaps] = useState<Snap[]>([]); const [last, setLast] = useState<string>(); const [folder, setFolder] = useState<string>(); const [folderOk, setFolderOk] = useState(false)
  const [srv, setSrv] = useState<{ file: string; size: number; at: string }[]>([])
  const [restore, setRestore] = useState<{ label: string; text: string } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const refresh = async () => {
    setSnaps(await listSnaps()); setLast(await lastBackup())
    const h = await getFolder(); setFolder(h?.name); setFolderOk(h ? await folderReady(h) : false)
    if (sync.mode === 'server') { try { setSrv(await serverApi.listBackups()) } catch { /* */ } }
  }
  useEffect(() => { void refresh() }, [sync.mode])
  const ex = (fn: () => void) => { if (!blockedDownload(toast.err)) { try { fn() } catch (e) { toast.err(String((e as Error).message)) } } }
  const set = (h: number) => api.saveShop({ ...db.shop, autoBackupHours: h })
  return <>
    <PageHeader title="Backup & export" sub="Download reports as Excel or PDF, and keep full database backups for complete recovery" />
    <div className="no-print mb-4 flex flex-wrap items-end gap-3"><Field label="Reports from"><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field><Field label="To"><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field></div>
    <Card className="divide-y divide-border">
      <Row title="Products & inventory" tags={['Excel']} sub={`${db.variants.length} items with SKU, barcode, size, colour, prices and stock`}>
        <Button variant="primary" onClick={() => ex(() => exportsFor.stockExcel(db))}><Download size={16} />Download stock Excel</Button></Row>
      <Row title="Sales reports" tags={['Excel', 'PDF']} sub="Every bill with GST split, plus item-wise sales">
        <Button onClick={() => ex(() => exportsFor.salesExcel(db, from, to))}><FileSpreadsheet size={16} />Excel</Button><Button onClick={() => ex(() => exportsFor.salesPDF(db, from, to))}><FileText size={16} />PDF</Button></Row>
      <Row title="Purchase reports" tags={['Excel', 'PDF']} sub="Supplier purchases, amounts paid and balances">
        <Button onClick={() => ex(() => exportsFor.purchaseExcel(db, from, to))}><FileSpreadsheet size={16} />Excel</Button><Button onClick={() => ex(() => exportsFor.purchasePDF(db, from, to))}><FileText size={16} />PDF</Button></Row>
      <Row title="Supplier & customer data" tags={['Excel']} sub={`${db.customers.length} customers and ${db.suppliers.length} suppliers with balances`}>
        <Button onClick={() => ex(() => exportsFor.partiesExcel(db))}><FileSpreadsheet size={16} />Excel</Button></Row>
      <Row title="Accounts & expenses" tags={['Excel', 'PDF']} sub="Cash book, income and expenses">
        <Button onClick={() => ex(() => exportsFor.accountsExcel(db, from, to))}><FileSpreadsheet size={16} />Excel</Button><Button onClick={() => ex(() => exportsFor.accountsPDF(db, from, to))}><FileText size={16} />PDF</Button></Row>
    </Card>

    <Card className="mt-4" title={<span className="flex items-center gap-2"><ShieldCheck size={16} className="text-success" />Full database backup</span>}>
      <div className="p-5">
        <p className="mb-4 max-w-2xl text-sm text-muted">Excel files are for reading and sharing. To recover the shop completely (every bill, customer, stock count, ledger and setting), restore a full backup file.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => ex(() => saveText(`narayana-backup-${localToday()}.json`, api.exportJSON()))}><Download size={16} />Download full backup</Button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) setRestore({ label: f.name, text: await f.text() }); e.target.value = '' }} />
          <Button onClick={() => file.current?.click()}><Upload size={16} />Restore from file</Button>
        </div>
      </div>
    </Card>

    <Card className="mt-4" title={<span className="flex items-center gap-2"><History size={16} />Scheduled automatic backup</span>}>
      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <div className="space-y-3 text-sm">
          <Field label="Back up automatically"><Select value={db.shop.autoBackupHours} onChange={e => set(+e.target.value)}><option value={0}>Off</option><option value={4}>Every 4 hours</option><option value={12}>Every 12 hours</option><option value={24}>Once a day</option></Select></Field>
          <div>Last backup: <b>{last ? dt(last) : 'not yet'}</b></div>
          <div className="flex flex-wrap gap-2"><Button onClick={async () => { try { const w = await backupNow(); toast.ok(`Backed up to ${w}`); void refresh() } catch { toast.err('Backup failed: browser storage is blocked') } }}>Back up now</Button>
            {folderSupported() && <Button onClick={async () => { try { const n = await pickFolder(); toast.ok(`Backups will also be saved in "${n}"`); void refresh() } catch { /* cancelled */ } }}><FolderOpen size={16} />{folder ? 'Change backup folder' : 'Choose backup folder'}</Button>}
            {folder && !folderOk && <Button variant="primary" onClick={async () => { const h = await getFolder(); if (h && await folderReady(h, true)) { setFolderOk(true); toast.ok('Folder reconnected') } }}>Reconnect folder</Button>}</div>
          <p className="text-xs text-muted">{folder ? `Backup files also go to the folder "${folder}"${folderOk ? '' : ' after you reconnect it (Chrome asks once after each restart)'}. Pick a folder on a pen drive, Google Drive or OneDrive for an off-computer copy.` : folderSupported() ? 'Choose a folder (e.g. Google Drive or OneDrive on the shop PC) to also write each backup there as a file.' : 'Copies are kept inside this browser. Use Chrome or Edge on the shop PC to also save them to a folder.'}</p>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">Backups on this computer (last 14)</div>
          <ul className="max-h-64 divide-y divide-border overflow-auto rounded-md border border-border text-sm">{snaps.length ? snaps.map(s => <li key={s.at} className="flex items-center justify-between gap-2 px-3 py-2">
            <span>{dt(s.at)} <span className="text-xs text-muted">{(s.size / 1024).toFixed(0)} KB</span></span>
            <span className="flex gap-1"><Button size="sm" variant="ghost" onClick={async () => ex(async () => saveText(`narayana-backup-${s.at.slice(0, 16).replace(/[:T]/g, '-')}.json`, await getSnap(s.at)) as unknown as void)}>Download</Button>
              <Button size="sm" variant="ghost" onClick={async () => setRestore({ label: `backup from ${dt(s.at)}`, text: await getSnap(s.at) })}>Restore</Button></span></li>) : <li className="px-3 py-6 text-center text-muted">No automatic backups yet</li>}</ul>
        </div>
      </div>
    </Card>

    <Card className="mt-4" title={<span className="flex items-center gap-2"><Server size={16} />Central database</span>}>
      <div className="p-5 text-sm">{sync.mode === 'server' ? <>
        <p>Connected to the shop's central database <b>{sync.server}</b>. All counters see the same stock, bills and accounts. The server also keeps its own dated backups.</p>
        <div className="mt-3 flex flex-wrap gap-2"><Button onClick={async () => { if (await serverApi.backupNow()) { toast.ok('Server backup saved'); void refresh() } else toast.err('Only the owner can back up the central database') }}>Back up server now</Button>
          <a className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm hover:bg-surface-2" href={serverApi.exportUrl()} download>Download full central copy</a></div>
        <ul className="mt-3 max-h-56 divide-y divide-border overflow-auto rounded-md border border-border">{srv.map(b => <li key={b.file} className="flex justify-between px-3 py-2"><span>{dt(b.at)} <span className="text-xs text-muted">{(b.size / 1024).toFixed(0)} KB</span></span><a className="text-accent" href={serverApi.backupUrl(b.file)} download>Download</a></li>)}</ul></>
        : <p className="text-muted">This computer is working on its own. To share one database between billing counters, run the Narayana server on the main shop PC (see the setup guide) and open the app from its address on every counter.</p>}</div>
    </Card>

    <Modal open={!!restore} onClose={() => setRestore(null)} title="Restore this backup?" footer={<><Button onClick={() => setRestore(null)}>Cancel</Button><Button variant="danger" onClick={async () => { try { await api.importJSON(restore!.text); toast.ok('Backup restored'); setRestore(null) } catch (e) { toast.err((e as Error).message) } }}>Replace current data</Button></>}>
      <p className="text-sm">All current data{sync.mode === 'server' ? ' on the central database' : ' on this computer'} will be replaced with <b>{restore?.label}</b>. Take a backup first if you might need today's data. This can't be undone.</p>
    </Modal>
  </>
}
