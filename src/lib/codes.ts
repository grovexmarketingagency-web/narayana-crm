import type { DB, Product, Variant } from './types'
/* SKU: CAT-PPPP-SIZE-COL, e.g. SAR-0002-FREE-MAR. Barcode: NT + 6 digits, unique, Code128 friendly. */
const clean = (s: string, n: number) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, n)
export function productCode(db: DB, p: Product) {
  const i = db.products.findIndex(x => x.id === p.id); return String(i >= 0 ? i + 1 : db.products.length + 1).padStart(4, '0')
}
export function makeSku(db: DB, p: Product, v: Pick<Variant, 'size' | 'colour'>) {
  return [clean(p.category, 3) || 'GEN', productCode(db, p), clean(v.size, 4), clean(v.colour, 3)].filter(Boolean).join('-')
}
export function nextBarcode(db: DB) {
  const used = new Set(db.variants.map(v => v.barcode))
  let n = (db.counters.barcode || 0) + 300000
  let code = ''
  do { n++; code = 'NT' + n } while (used.has(code))
  db.counters.barcode = n - 300000
  return code
}
