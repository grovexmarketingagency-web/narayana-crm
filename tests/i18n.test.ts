import { describe, it, expect } from 'vitest'
import { WORDS, tr } from '../src/lib/i18n'
import { PAGES } from '../src/lib/access'

describe('Malayalam and Tamil words', () => {
  it('both languages have the same words, and every menu item is translated', () => {
    expect(Object.keys(WORDS.ta).sort()).toEqual(Object.keys(WORDS.ml).sort())
    for (const p of PAGES) { expect(WORDS.ml[p.label], p.label).toBeTruthy(); expect(WORDS.ta[p.label], p.label).toBeTruthy() }
  })
  it('falls back to English', () => {
    expect(tr('en', 'Bills')).toBe('Bills'); expect(tr('ml', 'Something new')).toBe('Something new'); expect(tr('ta', 'TOTAL')).toBe('மொத்தம்')
  })
})
