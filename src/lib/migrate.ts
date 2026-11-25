import type { DB } from './types'
import { defaultPermissions } from './access'
import { deriveSections, ensureSection, makeSku } from './codes'
/* Bring older saved data up to the current shape. Safe to run on every load. */
export function migrate(db: DB): DB {
  const s = db.shop as DB['shop']
  s.printerWidth ??= '80'; s.labelCode ??= 'barcode'; s.autoBackupHours ??= 24; s.openingCash ??= 0; s.openingBank ??= 0
  db.incomes ??= []; db.supplierPayments ??= []; db.permissions ??= defaultPermissions()
  for (const r of ['owner', 'manager', 'cashier', 'accountant'] as const) {
    // pages added later default on for roles that would have had them
    const def = defaultPermissions()[r]; if (!db.permissions[r]) db.permissions[r] = def
    if (db.version < 2) for (const p of ['/accounts', '/backup']) if (def.includes(p) && !db.permissions[r].includes(p)) db.permissions[r].push(p)
    if (db.version < 3) for (const p of ['/tools']) if (def.includes(p) && !db.permissions[r].includes(p)) db.permissions[r].push(p)
  }
  if (!Array.isArray(s.sections)) s.sections = deriveSections(db.products)
  db.products.forEach(p => ensureSection(db, p.category))      // every product's section is in the list
  db.purchases.forEach(p => { p.paid ??= p.total; p.payMode ??= 'bank' })
  db.variants.forEach(v => { if (!v.sku) { const p = db.products.find(x => x.id === v.productId); if (p) v.sku = makeSku(db, p, v) } })
  db.version = 4
  return db
}
