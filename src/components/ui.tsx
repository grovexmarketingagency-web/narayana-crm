import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'
import { X } from 'lucide-react'

type BV = 'primary' | 'secondary' | 'ghost' | 'danger'
export function Button({ variant = 'secondary', size = 'md', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BV; size?: 'sm' | 'md' | 'lg' }) {
  const v = { primary: 'bg-accent text-on-accent hover:bg-accent-strong border-transparent', secondary: 'bg-surface text-text border-border hover:bg-surface-2',
    ghost: 'bg-transparent border-transparent text-text hover:bg-surface-2', danger: 'bg-danger text-white border-transparent hover:opacity-90' }[variant]
  const sz = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-5 text-base' }[size]
  return <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-md border font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${v} ${sz} ${className}`} />
}

export function Field({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={`flex flex-col gap-1 text-sm ${className}`}><span className="font-medium text-muted">{label}</span>{children}{hint && <span className="text-xs text-muted">{hint}</span>}</label>
}
const inputCls = 'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none'
export function Input(p: InputHTMLAttributes<HTMLInputElement>) { return <input {...p} className={`${inputCls} ${p.className || ''}`} /> }
export function Select({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...p} className={`${inputCls} ${p.className || ''}`}>{children}</select> }
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...p} className={`${inputCls} h-auto py-2 ${p.className || ''}`} /> }

export function Card({ children, className = '', title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return <section className={`rounded-lg border border-border bg-surface ${className}`}>
    {title && <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2>{action}</header>}
    {children}
  </section>
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'accent' | 'gold' | 'danger' | 'success' }) {
  const c = tone ? { accent: 'text-accent', gold: 'text-gold', danger: 'text-danger', success: 'text-success' }[tone] : ''
  return <div className="rounded-lg border border-border bg-surface p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
    <div className={`num mt-1 text-2xl font-semibold ${c}`}>{value}</div>{sub && <div className="mt-1 text-xs text-muted">{sub}</div>}</div>
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent' }) {
  const c = { neutral: 'bg-surface-2 text-muted', success: 'bg-success/10 text-success', warning: 'bg-warning/10 text-warning', danger: 'bg-danger/10 text-danger', accent: 'bg-accent/10 text-accent' }[tone]
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{children}</span>
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k)
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(), 30)
    return () => window.removeEventListener('keydown', k)
  }, [open])
  if (!open) return null
  return <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`max-h-[92vh] w-full overflow-auto rounded-t-lg bg-surface shadow-xl sm:rounded-lg ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-5 py-3"><h2 className="font-semibold">{title}</h2>
        <button aria-label="Close" onClick={onClose} className="rounded p-1 hover:bg-surface-2"><X size={18} /></button></header>
      <div className="p-5">{children}</div>
      {footer && <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface px-5 py-3">{footer}</footer>}
    </div>
  </div>
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  const has = Array.isArray(children) ? children.flat().filter(Boolean).length > 0 : !!children
  return <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">{head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-2 font-medium">{h}</th>)}</tr></thead>
    <tbody className="divide-y divide-border">{has ? children : <tr><td colSpan={head.length} className="px-4 py-10 text-center text-muted">{empty || 'Nothing here yet'}</td></tr>}</tbody>
  </table></div>
}
export const Td = ({ children, className = '' }: { children?: ReactNode; className?: string }) => <td className={`px-4 py-2.5 align-middle ${className}`}>{children}</td>

export function Bars({ data, height = 140, fmt = (n: number) => String(n) }: { data: { label: string; value: number }[]; height?: number; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...data.map(d => d.value))
  if (!data.length) return <div className="py-8 text-center text-sm text-muted">No data for this range</div>
  return <div className="flex items-end gap-1" style={{ height }} role="img" aria-label="bar chart">
    {data.map(d => <div key={d.label} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
      <div className="rounded-t-sm bg-accent/80 transition-colors group-hover:bg-accent" style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0 }} />
      <div className="mt-1 truncate text-center text-[10px] text-muted">{d.label}</div>
      <div className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-text px-1.5 py-0.5 text-[11px] text-bg group-hover:block">{fmt(d.value)}</div>
    </div>)}
  </div>
}

/* toasts */
type T = { id: number; msg: string; tone: 'success' | 'error' }
let pushT: (t: Omit<T, 'id'>) => void = () => {}
export const toast = { ok: (msg: string) => pushT({ msg, tone: 'success' }), err: (msg: string) => pushT({ msg, tone: 'error' }) }
export function Toaster() {
  const [list, set] = useState<T[]>([])
  useEffect(() => { pushT = t => { const id = Date.now() + Math.random(); set(l => [...l, { ...t, id }]); setTimeout(() => set(l => l.filter(x => x.id !== id)), 3200) } }, [])
  return <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2" aria-live="polite">
    {list.map(t => <div key={t.id} className={`rounded-md px-4 py-2.5 text-sm text-white shadow-lg ${t.tone === 'success' ? 'bg-success' : 'bg-danger'}`}>{t.msg}</div>)}
  </div>
}

export function PinPad({ onSubmit, error, label = 'Enter PIN' }: { onSubmit: (pin: string) => void; error?: string; label?: string }) {
  const [pin, setPin] = useState('')
  const pinRef = useRef(''); const submitRef = useRef(onSubmit); submitRef.current = onSubmit
  const update = (v: string) => { pinRef.current = v; setPin(v) }
  const press = (k: string) => {
    const cur = pinRef.current
    if (k === '⌫') update(cur.slice(0, -1)); else if (k === 'OK') { update(''); submitRef.current(cur) } else if (cur.length < 6) update(cur + k)
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫'); else if (e.key === 'Enter') { e.preventDefault(); press('OK') } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])
  return <div className="flex flex-col items-center gap-3">
    <div className="text-sm text-muted">{label}</div>
    <div className="flex h-8 gap-2" aria-label={`${pin.length} digits entered`}>{Array.from({ length: Math.max(4, pin.length) }).map((_, i) => <span key={i} className={`h-3 w-3 rounded-full ${i < pin.length ? 'bg-accent' : 'bg-border'}`} />)}</div>
    {error && <div role="alert" className="text-sm text-danger">{error}</div>}
    <div className="grid grid-cols-3 gap-2">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map(k =>
      <button key={k} type="button" onClick={() => press(k)} aria-label={k === '⌫' ? 'Delete' : k}
        className={`h-14 w-16 rounded-md border border-border text-lg font-semibold ${k === 'OK' ? 'bg-accent text-on-accent' : 'bg-surface hover:bg-surface-2'}`}>{k}</button>)}</div>
  </div>
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-display text-2xl font-semibold">{title}</h1>{sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}</div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div>
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[] }) {
  return <div role="tablist" className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-border">{items.map(i =>
    <button key={i.id} role="tab" aria-selected={value === i.id} onClick={() => onChange(i.id)}
      className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${value === i.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text'}`}>{i.label}</button>)}</div>
}
