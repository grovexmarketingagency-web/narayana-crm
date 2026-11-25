import type { DB, Product, Section, Variant } from './types'
/* SKU: CAT-PPPP-SIZE-COL, e.g. SAR-0002-FREE-MAR.
   Barcode: the shop section's 3-letter code + 6 digits (SAR300125 for Sarees, KUR300126 for Kurtis), unique and Code128 friendly,
   so staff can tell the section from the label. Older NT… barcodes keep working. */
const clean = (s: string, n: number) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, n)
export function productCode(db: DB, p: Product) {
  const i = db.products.findIndex(x => x.id === p.id); return String(i >= 0 ? i + 1 : db.products.length + 1).padStart(4, '0')
}
export function makeSku(db: DB, p: Product, v: Pick<Variant, 'size' | 'colour'>) {
  return [clean(p.category, 3) || 'GEN', productCode(db, p), clean(v.size, 4), clean(v.colour, 3)].filter(Boolean).join('-')
}
/** short code for a shop section, e.g. Sarees → SAR, Men's Wear → MEN */
export const sectionCode = (section: string | undefined) => clean(section || '', 3) || 'NT'
/** a 3-letter code for a new section that no other section uses (SAR, SA2, SA3…) */
export function freeSectionCode(taken: Section[], name: string): string {
  const base = sectionCode(name); const used = new Set(taken.map(s => s.code))
  if (!used.has(base)) return base
  for (let n = 2; n < 100; n++) { const c = base.slice(0, 2) + n; if (!used.has(c)) return c }
  return base + taken.length
}
/** sections for data that has products but no section list yet */
export function deriveSections(products: Pick<Product, 'category'>[]): Section[] {
  const out: Section[] = []
  for (const n of [...new Set(products.map(p => p.category).filter(Boolean))].sort()) out.push({ name: n, code: freeSectionCode(out, n) })
  return out
}
/** makes sure a product's section is in the list (imports and old data may bring new names) */
export function ensureSection(d: DB, name: string) {
  if (!name || d.shop.sections.some(s => s.name.toLowerCase() === name.toLowerCase())) return
  d.shop.sections.push({ name, code: freeSectionCode(d.shop.sections, name) })
}
export function nextBarcode(db: DB, section?: string) {
  const used = new Set(db.variants.map(v => v.barcode))
  let n = (db.counters.barcode || 0) + 300000
  let code = ''
  const pre = section === undefined ? 'NT' : db.shop.sections?.find(x => x.name.toLowerCase() === section.toLowerCase())?.code ?? sectionCode(section)
  do { n++; code = pre + n } while (used.has(code))
  db.counters.barcode = n - 300000
  return code
}
