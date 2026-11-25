/* vercel.json must send the same security headers the server does, and the daily backup job must exist. */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { SEC } from '../server/src/app'

describe('vercel.json', () => {
  const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'))
  it('sends the same security headers as the server', () => {
    const all = Object.fromEntries(v.headers[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]))
    for (const [k, val] of Object.entries(SEC)) expect(all[k]).toBe(val)
  })
  it('has the daily job, the function and the Mumbai region', () => {
    expect(v.crons[0].path).toBe('/api/cron')
    expect(v.functions['api/[...slug].mjs'].maxDuration).toBeGreaterThan(0)
    expect(v.regions).toEqual(['bom1'])
  })
})
