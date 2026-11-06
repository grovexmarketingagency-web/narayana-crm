import { useState } from 'react'
import { useStore } from '../lib/store'
import { inr } from '../lib/format'
import type { Variant } from '../lib/types'

/* Scan-or-type box that returns a variant: used by purchases and stock count */
export function VariantSearch({ onPick, placeholder = 'Scan or type an item', autoFocus }: { onPick: (v: Variant) => void; placeholder?: string; autoFocus?: boolean }) {
  const { db } = useStore(); const [q, setQ] = useState('')
  const res = q.length >= 2 ? db.variants.filter(v => { const p = db.products.find(x => x.id === v.productId)!; const s = q.toLowerCase(); return v.barcode.toLowerCase().includes(s) || p.name.toLowerCase().includes(s) }).slice(0, 8) : []
  const pick = (v: Variant) => { onPick(v); setQ('') }
  return <form className="relative" onSubmit={e => { e.preventDefault(); const v = db.variants.find(x => x.barcode.toUpperCase() === q.trim().toUpperCase()) || (res.length === 1 ? res[0] : undefined); if (v) pick(v) }}>
    <input autoFocus={autoFocus} value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-11 w-full rounded-md border-2 border-border bg-surface px-3 text-sm focus:border-accent focus:outline-none" />
    {res.length > 0 && <ul className="absolute z-20 mt-1 w-full rounded-md border border-border bg-surface shadow-lg">{res.map(v => { const p = db.products.find(x => x.id === v.productId)!
      return <li key={v.id}><button type="button" onClick={() => pick(v)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-surface-2"><span>{p.name} <span className="text-muted">{[v.size, v.colour].filter(Boolean).join('/')} · {v.barcode}</span></span><span className="text-xs text-muted">{inr(v.mrp)} · stock {v.stock}</span></button></li> })}</ul>}
  </form>
}
