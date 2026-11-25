import { describe, it, expect } from 'vitest'
import { produce } from 'immer'
import { buildSeed, blankDB } from '../src/lib/seed'
import { applyOp, OpError } from '../src/lib/ops'
import { migrate } from '../src/lib/migrate'
import { nextBarcode } from '../src/lib/codes'
import { searchVariants } from '../src/lib/search'
import type { DB } from '../src/lib/types'
import { op } from './helpers'

const run = (db: DB, name: string, args: unknown) => produce(db, d => applyOp(d, { ...op(name, args), staffId: 's1' } as never))
const seeded = () => migrate(buildSeed())

describe('sections', () => {
  it('existing data gets a section for each product category, with unique codes', () => {
    const db = seeded(); const names = db.shop.sections.map(s => s.name)
    expect(names).toEqual(expect.arrayContaining(['Sarees', 'Kurtis', "Men's Wear"]))
    expect(new Set(db.shop.sections.map(s => s.code)).size).toBe(db.shop.sections.length)
    expect(db.products.every(p => names.includes(p.category))).toBe(true)
  })
  it('a new shop starts with no sections, and migrating twice changes nothing', () => {
    const b = migrate(blankDB('Shop', 'Owner', '4826')); expect(b.shop.sections).toEqual([])
    const a = seeded(); expect(migrate(structuredClone(a))).toEqual(a)
  })
  it('the owner can add, rename and remove sections; barcodes use the section code', () => {
    let db = run(seeded(), 'saveSections', { sections: [...seeded().shop.sections.map(s => ({ ...s, was: s.name })), { name: 'Bridal', code: 'brd' }] })
    expect(db.shop.sections.find(s => s.name === 'Bridal')?.code).toBe('BRD')
    expect(nextBarcode(db, 'Bridal')).toMatch(/^BRD\d{6}$/)
    db = run(db, 'saveSections', { sections: db.shop.sections.map(s => s.name === 'Sarees' ? { ...s, name: 'Silk Sarees', was: 'Sarees' } : { ...s, was: s.name }) })
    expect(db.products.some(p => p.category === 'Sarees')).toBe(false); expect(db.products.some(p => p.category === 'Silk Sarees')).toBe(true)
    db = run(db, 'saveSections', { sections: db.shop.sections.filter(s => s.name !== 'Bridal').map(s => ({ ...s, was: s.name })) })
    expect(db.shop.sections.some(s => s.name === 'Bridal')).toBe(false)
  })
  it('refuses duplicates and removing a section that still has products', () => {
    const db = seeded(); const keep = db.shop.sections.map(s => ({ ...s, was: s.name }))
    expect(() => run(db, 'saveSections', { sections: [...keep, { name: 'sarees', code: 'ZZ9' }] })).toThrow(OpError)
    expect(() => run(db, 'saveSections', { sections: [...keep, { name: 'New', code: keep[0].code }] })).toThrow(/two sections/)
    expect(() => run(db, 'saveSections', { sections: keep.filter(s => s.name !== 'Sarees') })).toThrow(/still has items/)
  })
  it('a product or an import with a new section adds it, and saving shop settings keeps the list', () => {
    const db = seeded(); const p = db.products[0]
    const a = run(db, 'saveProduct', { product: { ...p, category: 'Dupattas' }, variants: db.variants.filter(v => v.productId === p.id) })
    expect(a.shop.sections.some(s => s.name === 'Dupattas')).toBe(true)
    const b = run(a, 'saveShop', { shop: { ...a.shop, name: 'Renamed' } })
    expect(b.shop.name).toBe('Renamed'); expect(b.shop.sections).toEqual(a.shop.sections)
  })
})

describe('live search', () => {
  const db = seeded()
  it('every word must match, in any order, across name, colour, size and section', () => {
    const r = searchVariants(db, 'silk maroon'); expect(r.length).toBeGreaterThan(0)
    for (const v of r) { const p = db.products.find(x => x.id === v.productId)!; expect(`${p.name} ${v.colour}`.toLowerCase()).toMatch(/silk/); expect(v.colour.toLowerCase()).toContain('maroon') }
    expect(searchVariants(db, 'maroon silk').map(v => v.id)).toEqual(r.map(v => v.id))
    expect(searchVariants(db, 'kurtis').every(v => db.products.find(x => x.id === v.productId)!.category === 'Kurtis')).toBe(true)
  })
  it('one letter already shows results, a barcode comes first, and nonsense shows nothing', () => {
    expect(searchVariants(db, 'k').length).toBeGreaterThan(0)
    const v = db.variants[3]; expect(searchVariants(db, v.barcode)[0].id).toBe(v.id)
    expect(searchVariants(db, 'zzzzqq')).toEqual([]); expect(searchVariants(db, '   ')).toEqual([])
  })
})
