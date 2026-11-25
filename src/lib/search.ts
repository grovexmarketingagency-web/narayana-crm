import type { DB, Variant } from './types'
/** Live item search for billing, purchases and stock count. Every word typed must match somewhere in the
    name, section, brand, size, colour, barcode or SKU ("silk maroon" finds the maroon silk saree). The best matches come first. */
export function searchVariants(db: DB, q: string, limit = 8): Variant[] {
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!toks.length) return []
  const prod = new Map(db.products.map(p => [p.id, p]))
  const hits: { v: Variant; score: number }[] = []
  for (const v of db.variants) {
    const p = prod.get(v.productId); if (!p) continue
    const hay = `${p.name} ${p.category} ${p.brand || ''} ${v.size} ${v.colour} ${v.barcode} ${v.sku}`.toLowerCase()
    if (!toks.every(t => hay.includes(t))) continue
    const name = p.name.toLowerCase(), t0 = toks[0]
    hits.push({ v, score: v.barcode.toLowerCase().startsWith(t0) ? 0 : name.startsWith(t0) ? 1 : name.split(/\s+/).some(w => w.startsWith(t0)) ? 2 : 3 })
  }
  return hits.sort((a, b) => a.score - b.score).slice(0, limit).map(h => h.v)
}
