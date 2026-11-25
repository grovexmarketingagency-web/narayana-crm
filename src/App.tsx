import { useState } from 'react'
import { Calculator, Landmark, DatabaseBackup, Cloud, CloudOff, HardDrive, LayoutDashboard, ShoppingCart, ReceiptText, Users, Wallet, Scissors, Undo2, Package, QrCode, Truck, ScanLine, Building2, Tag, BadgeIndianRupee, Receipt, BarChart3, Settings, LogOut, Menu, Wifi, WifiOff } from 'lucide-react'
import { useStore, api, currentStaff, start, onSyncError } from './lib/store'
import { startAutoBackup } from './lib/backup'
import Accounts from './pages/Accounts'
import Backup from './pages/Backup'
import Tools from './pages/Tools'
import { useEffect } from 'react'
import { useRoute, go } from './lib/router'
import { GROUPS, PAGES, canSee } from './lib/access'
import { Toaster, PinPad, toast } from './components/ui'
import { Wordmark, Logo } from './components/Logo'
import Dashboard from './pages/Dashboard'
import Billing from './pages/Billing'
import Bills, { BillView } from './pages/Bills'
import Customers from './pages/Customers'
import Credit from './pages/Credit'
import Alterations from './pages/Alterations'
import Returns from './pages/Returns'
import Products from './pages/Products'
import Labels from './pages/Labels'
import Purchases from './pages/Purchases'
import StockCount from './pages/StockCount'
import Suppliers from './pages/Suppliers'
import Offers from './pages/Offers'
import Salesmen from './pages/Salesmen'
import Reports from './pages/Reports'
import SettingsPage from './pages/Settings'
import { useOnline } from './lib/useOnline'
import { inFrame } from './lib/format'
import { tr } from './lib/i18n'

const ICONS: Record<string, typeof LayoutDashboard> = { '/': LayoutDashboard, '/billing': ShoppingCart, '/bills': ReceiptText, '/customers': Users, '/credit': Wallet, '/alterations': Scissors,
  '/returns': Undo2, '/products': Package, '/labels': QrCode, '/purchases': Truck, '/stock-count': ScanLine, '/suppliers': Building2, '/offers': Tag, '/salesmen': BadgeIndianRupee,
  '/expenses': Receipt, '/accounts': Landmark, '/backup': DatabaseBackup, '/tools': Calculator, '/reports': BarChart3, '/settings': Settings }

function Login() {
  const { db, sync, loginStaff, shopName } = useStore()
  const people = sync.mode === 'server' ? loginStaff : db.staff.filter(s => s.active)
  const [sel, setSel] = useState('')
  const pick = sel || people[0]?.id || ''
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [held, setHeld] = useState(''); const [code, setCode] = useState('')   // PIN kept while the owner types the authenticator code
  const twoStep = sync.mode === 'server' && !!loginStaff.find(s => s.id === pick)?.twoStep
  return <div className="flex min-h-screen items-center justify-center bg-bg p-4">
    <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-sm">
      <div className="mb-6 flex flex-col items-center gap-2 text-center"><Logo size={56} /><h1 className="font-display text-2xl font-semibold">{shopName || 'Narayana Textiles'}</h1><p className="text-sm text-muted">{tr(db.shop.language, 'Counter & customer manager · pick your name to start')}</p></div>
      {sync.mode === 'server' && !people.length && <p className="mb-4 rounded-md bg-warning/10 p-3 text-sm text-warning">The central database is not reachable, so nobody can log in on this counter yet. Check that the server PC is on and connected to the shop network.</p>}
      <div className="mb-5 grid grid-cols-2 gap-2">{people.map(s =>
        <button key={s.id} onClick={() => { setSel(s.id); setErr(''); setHeld(''); setCode('') }} aria-pressed={pick === s.id}
          className={`rounded-md border px-3 py-2.5 text-left text-sm ${pick === s.id ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:bg-surface-2'}`}>
          <div className="font-medium">{s.name}</div><div className="text-xs capitalize text-muted">{s.role}</div></button>)}</div>
      {held ? <form className="space-y-3" onSubmit={async e => { e.preventDefault(); if (busy || code.length !== 6) return; setBusy(true); const r = await api.login(pick, held, code); setBusy(false); if (r !== true) { setErr(r); setCode(''); if (/PIN/.test(r)) setHeld('') } }}>
        <label className="block text-sm font-medium" htmlFor="code">6-digit code from your authenticator app</label>
        <input id="code" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setErr('') }}
          className="num h-12 w-full rounded-md border border-border bg-surface text-center text-2xl tracking-[0.5em] focus:border-accent focus:outline-none" />
        {(busy || err) && <p className={`text-center text-sm ${busy ? 'text-muted' : 'text-danger'}`}>{busy ? 'Checking…' : err}</p>}
        <div className="flex gap-2"><button type="button" onClick={() => { setHeld(''); setCode(''); setErr('') }} className="h-10 flex-1 rounded-md border border-border text-sm hover:bg-surface-2">Back</button>
          <button disabled={code.length !== 6 || busy} className="h-10 flex-1 rounded-md bg-accent text-sm font-medium text-on-accent disabled:opacity-50">Log in</button></div>
      </form>
      : <PinPad error={busy ? 'Checking…' : err} onSubmit={async pin => { if (busy || !pick) return; if (twoStep) { setHeld(pin); setErr(''); return } setBusy(true); const r = await api.login(pick, pin); setBusy(false); if (r === true) return; if (/6-digit code/.test(r)) { setHeld(pin); setErr('') } else setErr(r) }} />}
      {sync.mode === 'local' && db.staff.some(x => x.pin === '1234') && <p className="mt-5 text-center text-xs text-muted">Demo PINs: Owner 1234 · Manager 2222 · Cashier 1111 · Accountant 0000</p>}
    </div>
  </div>
}

let started = false
export default function App() {
  const { db, sync, ready, hasData } = useStore()
  useEffect(() => { if (!started) { started = true; onSyncError(m => toast.err(m)); void start().then(() => startAutoBackup()) } }, [])
  const route = useRoute()
  const me = currentStaff()
  const [nav, setNav] = useState(false)
  const online = useOnline()
  if (!ready) return <div className="flex min-h-screen items-center justify-center bg-bg text-muted"><Logo size={48} /></div>
  if (!me) return <><Login /><Toaster /></>
  if (!hasData) return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg text-muted"><Logo size={48} /><p>Loading the shop's data from the central database…</p><Toaster /></div>
  const path = route.split('?')[0]
  const allowed = canSee(db, me.role, path)
  const base = '/' + path.split('/')[1]
  const page = !allowed ? <div className="p-10 text-center text-muted">Your role ({me.role}) can't open this screen. Ask the owner for access.</div> : (() => {
    if (path.startsWith('/bills/')) return <BillView id={path.split('/')[2]} />
    switch (base) {
      case '/': return <Dashboard />; case '/billing': return <Billing />; case '/bills': return <Bills />; case '/customers': return <Customers />
      case '/credit': return <Credit />; case '/alterations': return <Alterations />; case '/returns': return <Returns />; case '/products': return <Products />
      case '/labels': return <Labels />; case '/purchases': return <Purchases />; case '/stock-count': return <StockCount />; case '/suppliers': return <Suppliers />
      case '/offers': return <Offers />; case '/salesmen': return <Salesmen />; case '/expenses': return <Accounts />; case '/accounts': return <Accounts />; case '/backup': return <Backup />; case '/tools': return <Tools />; case '/reports': return <Reports />
      case '/settings': return <SettingsPage />; default: return <div className="p-10 text-center text-muted">Page not found</div>
    }
  })()
  const links = PAGES.filter(p => canSee(db, me.role, p.path))
  return <div className="flex min-h-screen bg-bg">
    <aside className={`no-print fixed inset-y-0 left-0 z-40 w-60 shrink-0 border-r border-border bg-surface transition-transform lg:static lg:translate-x-0 ${nav ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-16 items-center border-b border-border px-4"><Wordmark /></div>
      <nav className="h-[calc(100vh-8rem)] overflow-y-auto p-2" aria-label="Main">{GROUPS.map(g => { const items = links.filter(p => p.group === g); if (!items.length) return null
        return <div key={g} className="mb-2"><div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{tr(db.shop.language, g)}</div>
          {items.map(p => { const I = ICONS[p.path]; const active = base === p.path
            return <a key={p.path} href={'#' + p.path} onClick={() => setNav(false)} aria-current={active ? 'page' : undefined}
              className={`mb-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-sm ${active ? 'bg-accent/10 font-semibold text-accent' : 'text-text hover:bg-surface-2'}`}><I size={17} />{tr(db.shop.language, p.label)}</a> })}</div> })}</nav>
      <div className="flex h-16 items-center justify-between border-t border-border px-4 text-sm">
        <div className="min-w-0"><div className="truncate font-medium">{me.name}</div><div className="text-xs capitalize text-muted">{me.role}</div></div>
        <button onClick={() => api.logout()} className="rounded p-2 hover:bg-surface-2" aria-label="Log out" title={tr(db.shop.language, 'Log out')}><LogOut size={17} /></button>
      </div>
    </aside>
    {nav && <div className="no-print fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setNav(false)} />}
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur">
        <button className="rounded p-1.5 hover:bg-surface-2 lg:hidden" onClick={() => setNav(true)} aria-label="Open menu"><Menu size={20} /></button>
        <div className="truncate text-sm text-muted">{db.shop.name} · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <div className="ml-auto flex items-center gap-3">
          {sync.mode === 'server'
            ? <span className={`flex items-center gap-1.5 text-xs ${sync.status === 'synced' ? 'text-success' : 'text-warning'}`} title={`Central database: ${sync.server}`}>{sync.status === 'synced' ? <Cloud size={14} /> : <CloudOff size={14} />}{sync.status === 'synced' ? 'Central database · saved' : sync.status === 'offline' ? `Server unreachable · ${sync.pending} changes waiting` : `Saving ${sync.pending}…`}</span>
            : <span className={`flex items-center gap-1.5 text-xs ${online ? 'text-muted' : 'text-warning'}`} title="No central server found. Data is saved on this computer and billing works offline.">{online ? <HardDrive size={14} /> : <WifiOff size={14} />}{online ? 'Saved on this computer' : 'Offline · billing continues'}</span>}
          {canSee(db, me.role, '/billing') && base !== '/billing' && <button onClick={() => go('/billing')} className="hidden h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-on-accent hover:bg-accent-strong sm:flex"><ShoppingCart size={16} />{tr(db.shop.language, 'New bill')}</button>}
        </div>
      </header>
      {inFrame && <div className="no-print border-b border-gold/30 bg-gold/10 px-4 py-1.5 text-xs text-text sm:px-6">Online preview with sample data. Your changes stay in this browser only; printing and file downloads work in the app installed on the shop computer.</div>}
      <main className="min-w-0 flex-1 p-4 sm:p-6">{page}</main>
    </div>
    <Toaster />
  </div>
}
