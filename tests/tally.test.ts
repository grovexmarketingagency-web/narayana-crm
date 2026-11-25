import { describe, it, expect } from 'vitest'
import { buildSeed } from '../src/lib/seed'
import { tallyXml } from '../src/lib/tally'

describe('Tally export', () => {
  it('exports every bill, and every voucher balances to the paisa', () => {
    const db = buildSeed()
    const { xml, counts } = tallyXml(db, '2000-01-01', '2100-01-01')
    expect(counts.sales).toBe(db.bills.length)
    const vouchers = xml.match(/<VOUCHER [\s\S]*?<\/VOUCHER>/g)!
    expect(vouchers.length).toBeGreaterThan(db.bills.length)
    for (const v of vouchers) {
      const sum = [...v.matchAll(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].reduce((s, m) => s + Number(m[1]), 0)
      expect(Math.abs(sum)).toBeLessThan(0.005)
    }
    // every ledger used by a voucher is created first
    const made = new Set([...xml.matchAll(/<LEDGER NAME="([^"]+)"/g)].map(m => m[1]))
    for (const m of xml.matchAll(/<LEDGERNAME>([^<]+)<\/LEDGERNAME>/g)) expect(made.has(m[1])).toBe(true)
  })
})
