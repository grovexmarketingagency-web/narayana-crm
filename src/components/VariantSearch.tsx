import { useState } from 'react'
import { useStore } from '../lib/store'
import { inr } from '../lib/format'
import type { Variant } from '../lib/types'
import { CameraScanButton } from './CameraScan'
import { searchVariants } from '../lib/search'

/* Scan-or-type box that returns a variant: used by purchases and stock count */
export function VariantSearch({ onPick, placeholder = 'Scan or type an item', autoFocus }: { onPick: (v: Variant) => void; placeholder?: string; autoFocus?: boolean }) {
  const { db } = useStore(); const [q, setQ] = useState(''); const [hi, setHi] = useState(0)
  const res = searchVariants(db, q)
  const pick = (v: Variant) => { onPick(v); setQ(''); setHi(0) }
  const byCode = (code: string) => db.variants.find(x => x.barcode.toUpperCase() === code.toUpperCase())
  return <div className="flex gap-2"><form className="relative flex-1" onSubmit={e => { e.preventDefault(); const v = byCode(q.trim()) || res[Math.min(hi, res.length - 1)]; if (v) pick(v) }}>
    <input autoFocus={autoFocus} value={q} onChange={e => { setQ(e.target.value); setHi(0) }} placeholder={placeholder} aria-label={placeholder} className="h-11 w-full rounded-md border-2 border-border bg-surface px-3 text-sm focus:border-accent focus:outline-none"
      onKeyDown={e => { if (e.key === 'ArrowDown' && res.length) { e.preventDefault(); setHi(h => Math.min(h + 1, res.length - 1)) } else if (e.key === 'ArrowUp' && res.length) { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) } else if (e.key === 'Escape') setQ('') }} />
    {res.length > 0 && <ul className="absolute z-20 mt-1 w-full rounded-md border border-border bg-surface shadow-lg">{res.map((v, i) => { const p = db.products.find(x => x.id === v.productId)!
      return <li key={v.id}><button type="button" onMouseEnter={() => setHi(i)} onClick={() => pick(v)} className={`flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-surface-2 ${i === hi ? 'bg-accent/10' : ''}`}><span>{p.name} <span className="text-muted">{[v.size, v.colour].filter(Boolean).join('/')} · {v.barcode}</span></span><span className="text-xs text-muted">{inr(v.mrp)} · stock {v.stock}</span></button></li> })}</ul>}
  </form><CameraScanButton onCode={code => { const v = byCode(code); if (v) onPick(v) }} /></div>
}
