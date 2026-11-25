import { describe, it, expect } from 'vitest'
import { nextBarcode, sectionCode } from '../src/lib/codes'
import { buildSeed } from '../src/lib/seed'

describe('section barcodes', () => {
  it('new barcodes start with the section code and never repeat', () => {
    const db = buildSeed()
    expect(sectionCode("Men's Wear")).toBe('MEN'); expect(sectionCode('')).toBe('NT')
    const a = nextBarcode(db, 'Sarees'), b = nextBarcode(db, 'Sarees'), c = nextBarcode(db, 'Kurtis')
    expect(a).toMatch(/^SAR\d{6}$/); expect(c).toMatch(/^KUR\d{6}$/)
    expect(new Set([a, b, c]).size).toBe(3)
    expect(nextBarcode(db)).toMatch(/^NT\d{6}$/)
  })
})
