/* The shared rules: the same checks run on each counter and on the central database. */
import { describe, it, expect } from 'vitest'
import { produce } from 'immer'
import { buildSeed } from '../src/lib/seed'
import { applyOp, denied, validate, OpError } from '../src/lib/ops'
import { gstRateFor, computeDraft } from '../src/lib/calc'
import { migrate } from '../src/lib/migrate'
import type { DB } from '../src/lib/types'
import { cashBill, op } from './helpers'

const run = (db: DB, name: string, args: unknown, staffId = 's1', extra = {}) => produce(db, d => applyOp(d, { ...op(name, args), staffId } as never, extra))
const staff = (db: DB, id: string) => db.staff.find(s => s.id === id)

describe('GST', () => {
  const shop = buildSeed().shop
  it('garments up to the threshold are 5%, above are 18%', () => {
    expect(gstRateFor(shop, 'garment', 2500)).toBe(5)
    expect(gstRateFor(shop, 'garment', 2501)).toBe(18)
  })
  it('fabric is 5% at any price', () => { expect(gstRateFor(shop, 'fabric', 99999)).toBe(5) })
  it('a bill splits tax-inclusive prices into taxable value and tax', () => {
    const db = buildSeed()
    const c = computeDraft(db, { id: 'x', label: '', lines: [{ variantId: db.variants[0].id, qty: 2, discount: 0 }], billDiscount: { type: 'pct', value: 0 }, couponCode: '', held: false, createdAt: '' })
    expect(Math.abs(c.taxable + c.tax - (c.total - c.roundOff))).toBeLessThan(0.05)
  })
})

describe('checkout', () => {
  it('saves the bill, takes stock out and numbers bills in order', () => {
    const db = buildSeed(); const v = db.variants[0]; const before = v.stock
    const next = run(db, 'checkout', cashBill(db, 'bill1', v.id, 1), 's3')
    const bill = next.bills.find(b => b.id === 'bill1')!
    expect(bill.staffId).toBe('s3')
    expect(next.variants.find(x => x.id === v.id)!.stock).toBe(before - 1)
    const n = run(next, 'checkout', cashBill(next, 'bill2', v.id, 1), 's3')
    expect(+n.bills.find(b => b.id === 'bill2')!.no.slice(3)).toBe(+bill.no.slice(3) + 1)
  })
  it('recalculates prices itself: payments that do not match the real total are refused', () => {
    const db = buildSeed(); const a = cashBill(db, 'cheat')
    a.payments[0].amount = 1
    expect(() => run(db, 'checkout', a)).toThrow(/do not match/)
  })
  it('refuses the same bill id twice', () => {
    const db = buildSeed(); const once = run(db, 'checkout', cashBill(db, 'dup1'))
    expect(() => run(once, 'checkout', cashBill(once, 'dup1'))).toThrow(/already saved/)
  })
  it('a big discount needs a valid owner approval when the server checks it', () => {
    const db = buildSeed(); const a = cashBill(db, 'disc1'); a.billDiscount = { type: 'pct', value: 30 }
    a.payments[0].amount = computeDraft(db, { id: 'disc1', label: '', lines: a.lines, billDiscount: a.billDiscount as never, couponCode: '', held: false, createdAt: '' }).total
    expect(() => run(db, 'checkout', a, 's3', { approve: () => null })).toThrow(/owner's PIN/)
    const ok = run(db, 'checkout', { ...a, approval: 'good' }, 's3', { approve: (bill: string, t: string) => (bill === 'disc1' && t === 'good' ? 's1' : null) })
    expect(ok.bills.some(b => b.id === 'disc1')).toBe(true)
  })
  it('rejects unknown fields and bad values', () => {
    expect(() => validate('checkout', { billId: '../x', lines: [] })).toThrow(OpError)
    expect(() => validate('addExpense', { id: 'e1', at: 'never', category: 'Tea', amount: -5, note: '' })).toThrow(OpError)
  })
})

describe('returns', () => {
  it('puts stock back and never lets more come back than was sold', () => {
    const db0 = buildSeed(); const v = db0.variants[0]
    const db1 = run(db0, 'checkout', cashBill(db0, 'rb', v.id, 1), 's3')
    const stock = db1.variants.find(x => x.id === v.id)!.stock
    const db2 = run(db1, 'doReturn', { id: 'r1', billId: 'rb', lines: [{ variantId: v.id, qty: 1 }], refundMode: 'credit_note' })
    expect(db2.variants.find(x => x.id === v.id)!.stock).toBe(stock + 1)
    expect(db2.vouchers.some(x => x.id === 'r1-cn')).toBe(true)
    expect(() => run(db2, 'doReturn', { id: 'r2', billId: 'rb', lines: [{ variantId: v.id, qty: 1 }], refundMode: 'cash' })).toThrow(/can still be returned/)
  })
})

describe('permissions', () => {
  const db = buildSeed()
  it('cashiers bill but cannot change prices or settings', () => {
    expect(denied(db, staff(db, 's3'), 'checkout')).toBeNull()
    expect(denied(db, staff(db, 's3'), 'saveProduct')).toMatch(/access/)
    expect(denied(db, staff(db, 's3'), 'saveShop')).toMatch(/owner/)
  })
  it('accountants are read-only', () => { expect(denied(db, staff(db, 's4'), 'addExpense')).toMatch(/read-only/) })
  it('the owner can do everything; inactive staff nothing', () => {
    expect(denied(db, staff(db, 's1'), 'savePermissions')).toBeNull()
    expect(denied(db, { ...staff(db, 's2')!, active: false }, 'checkout')).toMatch(/log in/)
  })
  it('follows the owner\'s permission screen', () => {
    const d2 = run(db, 'savePermissions', { role: 'cashier', pages: ['/', '/billing', '/products'] })
    expect(denied(d2, staff(d2, 's3'), 'saveProduct')).toBeNull()
    expect(denied(d2, staff(d2, 's3'), 'doReturn')).toMatch(/access/)
  })
  it('the last active owner cannot be removed', () => {
    expect(() => run(db, 'saveStaff', { staff: { ...staff(db, 's1')!, pin: undefined, active: false } })).toThrow(/at least one active owner/)
  })
})

describe('migrations', () => {
  it('are safe to run twice', () => {
    const once = migrate(buildSeed()); const twice = migrate(structuredClone(once))
    expect(twice).toEqual(once)
  })
})
