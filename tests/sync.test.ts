/* Counters rebuild exactly the server's data from records, in the same order. */
import { describe, it, expect } from 'vitest'
import { produce, setAutoFreeze } from 'immer'
import { buildSeed } from '../src/lib/seed'
import { applyOp } from '../src/lib/ops'
import { diff, toChanges, fromChanges, applyChanges, assignSeqs, type Change } from '../src/lib/sync'
import { cashBill, op } from './helpers'
setAutoFreeze(false)

const strip = (db: object) => ({ ...db, drafts: [] })

describe('records', () => {
  it('a whole database survives being split into records and rebuilt', () => {
    const db = { ...buildSeed(), drafts: [] }
    expect(fromChanges(toChanges(db, 1)).db).toEqual(strip(db))
  })
  it('only the records that changed are sent, and applying them gives the same data in the same order', () => {
    const db0 = { ...buildSeed(), drafts: [] }
    const all = toChanges(db0, 1)
    const counter = fromChanges(all)
    const seqs: Record<string, number> = {}; for (const c of all) seqs[c.c + '/' + c.i] = c.s
    let next = produce(db0, d => applyOp(d, { ...op('checkout', cashBill(db0, 'sb1')), staffId: 's3' } as never))
    next = produce(next, d => applyOp(d, { ...op('addExpense', { id: 'ex9', at: new Date().toISOString(), category: 'Tea', amount: 40, note: '' }), staffId: 's1' } as never))
    next = produce(next, d => applyOp(d, { ...op('deleteOffer', { id: db0.offers[0].id }), staffId: 's1' } as never))
    const changed = diff(db0, next)
    expect(changed.length).toBeLessThan(12)
    const s = { ...seqs }; assignSeqs(s, changed, all.length + 10)
    const records: Change[] = changed.map(ch => ({ ...ch, v: 2, s: s[ch.c + '/' + ch.i] ?? 0 }))
    const after = produce(counter.db, d => { applyChanges(d, counter.seqs, records) })
    expect(after).toEqual(strip(next))
    expect(after.expenses[0].id).toBe('ex9')            // newest first lists stay newest first
    expect(after.bills[after.bills.length - 1].id).toBe('sb1')   // bills stay oldest first
  })
})
