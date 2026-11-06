/* The central database server, tested the way counters and attackers would use it. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SqliteRepo } from '../server/src/repo-sqlite'
import { Engine } from '../server/src/engine'
import { buildSeed } from '../src/lib/seed'
import { startServer, counter, op, cashBill } from './helpers'

let srv: Awaited<ReturnType<typeof startServer>>
beforeAll(async () => { srv = await startServer() })
afterAll(async () => { await srv.close() })

describe('login', () => {
  it('needs a session for data', async () => {
    const r = await counter(srv.url).call('/changes?since=0')
    expect(r.status).toBe(401)
  })
  it('lists staff for the login screen without PINs or hashes', async () => {
    const r = await counter(srv.url).call('/hello')
    expect(r.status).toBe(200)
    expect(JSON.stringify(r.body)).not.toMatch(/pin/i)
  })
  it('logs in with the right PIN and sets an httpOnly, SameSite=Strict cookie', async () => {
    const c = counter(srv.url); const r = await c.login('s3', '1111')
    expect(r.status).toBe(200)
    expect(r.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Strict/)
    expect((await c.call('/me')).body.staff.id).toBe('s3')
  })
  it('never sends PINs or PIN hashes to counters', async () => {
    const c = counter(srv.url); await c.login('s1', '1234')
    const r = await c.call('/changes?since=0')
    const staff = r.body.changes.filter((x: { c: string }) => x.c === 'staff')
    expect(staff.length).toBeGreaterThan(0)
    expect(JSON.stringify(staff)).not.toMatch(/pin/i)
  })
  it('stores PINs only as hashes', async () => {
    expect(srv.engine.state.staff.every(s => !s.pin && s.pinHash?.startsWith('scrypt$'))).toBe(true)
  })
  it('locks a person after repeated wrong PINs, even for the right PIN, and limits tries per address', async () => {
    const own = await startServer({ env: { LOGIN_TRIES_PER_15MIN: '10' } })
    const c = counter(own.url)
    for (let i = 0; i < 6; i++) expect((await c.login('s2', '9999')).status).toBe(401)
    expect((await c.login('s2', '2222')).status).toBe(429)
    expect((await c.login('s3', '1111')).status).toBe(200)
    for (let i = 0; i < 4; i++) await c.login('s4', '9999')
    expect((await c.login('s1', '1234')).status).toBe(429)      // 11th try from this address
    await own.close()
  })
  it('logout ends the session', async () => {
    const c = counter(srv.url); await c.login('s3', '1111')
    await c.call('/logout', {})
    expect((await c.call('/me')).status).toBe(401)
  })
})

describe('changes', () => {
  it('a bill sent twice (network retry) is saved once', async () => {
    const c = counter(srv.url); await c.login('s3', '1111')
    const o = op('checkout', cashBill(srv.engine.state, 'retry1'))
    const a = await c.ops([o]); const b = await c.ops([o])
    expect(a.body.results[0].ok).toBe(true)
    expect(b.body.results[0]).toMatchObject({ ok: true, dup: true })
    expect(srv.engine.state.bills.filter(x => x.id === 'retry1')).toHaveLength(1)
  })
  it('two counters billing at once get different bill numbers and both take stock out', async () => {
    const A = counter(srv.url), B = counter(srv.url); await A.login('s1', '1234'); await B.login('s3', '1111')
    const v = srv.engine.state.variants[3]; const before = v.stock
    const [ra, rb] = await Promise.all([A.ops([op('checkout', cashBill(srv.engine.state, 'par1', v.id))]), B.ops([op('checkout', cashBill(srv.engine.state, 'par2', v.id))])])
    expect(ra.body.results[0].ok && rb.body.results[0].ok).toBe(true)
    const bills = srv.engine.state.bills.filter(b => b.id === 'par1' || b.id === 'par2')
    expect(new Set(bills.map(b => b.no)).size).toBe(2)
    expect(srv.engine.state.variants.find(x => x.id === v.id)!.stock).toBe(before - 2)
  })
  it('the server decides who made a change (cannot pretend to be the owner)', async () => {
    const c = counter(srv.url); await c.login('s3', '1111')
    await c.ops([{ ...op('checkout', cashBill(srv.engine.state, 'who1')), staffId: 's1' }])
    expect(srv.engine.state.bills.find(b => b.id === 'who1')!.staffId).toBe('s3')
  })
  it('refuses changes the role is not allowed, and tampered totals', async () => {
    const c = counter(srv.url); await c.login('s3', '1111')
    const bad = cashBill(srv.engine.state, 'tamper1'); bad.payments[0].amount = 10
    const r = await c.ops([op('saveShop', { shop: { ...srv.engine.state.shop, name: 'Hacked' } }), op('checkout', bad)])
    expect(r.body.results[0]).toMatchObject({ ok: false }); expect(r.body.results[0].error).toMatch(/owner/)
    expect(r.body.results[1].error).toMatch(/do not match/)
    expect(srv.engine.state.shop.name).toBe('Narayana Textiles')
  })
  it('accountants cannot change anything', async () => {
    const c = counter(srv.url); await c.login('s4', '0000')
    const r = await c.ops([op('addExpense', { id: 'acc1', at: new Date().toISOString(), category: 'Tea', amount: 10, note: '' })])
    expect(r.body.results[0].error).toMatch(/read-only/)
  })
  it('a big discount needs the owner PIN through the server', async () => {
    const c = counter(srv.url); await c.login('s3', '1111')
    const a = cashBill(srv.engine.state, 'bigdisc', srv.engine.state.variants[5].id)
    a.billDiscount = { type: 'amt', value: Math.round(a.payments[0].amount / 2) } as never
    a.payments[0].amount -= Math.round(a.payments[0].amount / 2)
    // totals are rounded, so ask the server's own maths for the exact figure
    const { computeDraft } = await import('../src/lib/calc')
    a.payments[0].amount = computeDraft(srv.engine.state, { id: 'bigdisc', label: '', lines: a.lines, billDiscount: a.billDiscount as never, couponCode: '', held: false, createdAt: '' }).total
    expect((await c.ops([op('checkout', a)])).body.results[0].error).toMatch(/owner's PIN/)
    expect((await c.call('/approve', { billId: 'bigdisc', pin: '1111' })).status).toBe(401)
    const tok = (await c.call('/approve', { billId: 'bigdisc', pin: '1234' })).body.token
    expect((await c.ops([op('checkout', { ...a, approval: tok.replace(/.$/, 'x') })])).body.results[0].ok).toBe(false)
    expect((await c.ops([op('checkout', { ...a, billId: 'other', approval: tok })])).body.results[0].ok).toBe(false)
    expect((await c.ops([op('checkout', { ...a, approval: tok })])).body.results[0].ok).toBe(true)
  })
  it('only sends what changed since the counter last asked', async () => {
    const c = counter(srv.url); await c.login('s1', '1234')
    const v = (await c.call('/changes?since=0')).body.version
    await c.ops([op('addExpense', { id: 'small1', at: new Date().toISOString(), category: 'Tea', amount: 25, note: '' })])
    const r = await c.call('/changes?since=' + v)
    expect(r.body.full).toBe(false)
    expect(r.body.changes.map((x: { c: string }) => x.c).sort()).toEqual(['audit', 'expenses'])
  })
  it('validates every change', async () => {
    const c = counter(srv.url); await c.login('s1', '1234')
    const r = await c.ops([op('addExpense', { id: 'v1', at: 'x', category: '', amount: -1, note: '' }), { id: 'zz', name: 'dropDatabase', args: {}, at: '' }, 'junk'])
    expect(r.body.results.map((x: { ok: boolean }) => x.ok)).toEqual([false, false, false])
  })
})

describe('web security', () => {
  it('sends security headers', async () => {
    const r = await fetch(srv.url + '/api/health')
    expect(r.headers.get('content-security-policy')).toMatch(/frame-ancestors 'none'/)
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
  it('refuses changes from other websites and without the app header', async () => {
    const c = counter(srv.url); await c.login('s1', '1234')
    expect((await c.call('/ops', { ops: [] }, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await c.call('/ops', { ops: [] }, { 'x-narayana': '0' })).status).toBe(403)
  })
  it('refuses oversized requests', async () => {
    const r = await fetch(srv.url + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-narayana': '1' }, body: JSON.stringify({ staffId: 'x'.repeat(5000), pin: '1' }) })
    expect(r.status).toBe(413)
  })
  it('health check reports storage', async () => {
    const r = await (await fetch(srv.url + '/api/health')).json()
    expect(r).toMatchObject({ ok: true, storage: 'sqlite' })
  })
})

describe('backup and restore', () => {
  it('is owner-only', async () => {
    const c = counter(srv.url); await c.login('s2', '2222')
    expect((await c.call('/backups')).status).toBe(403)
    expect((await c.call('/restore', { data: {} })).status).toBe(403)
  })
  it('backs up, refuses damaged files, restores, and tells counters to reload everything', async () => {
    const c = counter(srv.url); await c.login('s1', '1234')
    const made = await c.call('/backups', {}); expect(made.status).toBe(200)
    const file = await c.call('/backups/' + made.body.name)
    expect(file.body.bills.length).toBe(srv.engine.state.bills.length)
    expect((await c.call('/restore', { data: { hello: 1 } })).status).toBe(400)
    const before = (await c.call('/changes?since=0')).body.version
    const fresh = buildSeed()
    const r = await c.call('/restore', { data: fresh }); expect(r.status).toBe(200)
    expect(srv.engine.state.bills.length).toBe(fresh.bills.length)
    expect(srv.engine.state.staff.every(s => !s.pin)).toBe(true)          // plain PINs from the file were hashed
    expect((await c.call('/changes?since=' + before)).body.full).toBe(true)
    expect((await c.call('/backups')).body.some((b: { reason: string }) => b.reason === 'before restore')).toBe(true)
  })
})

describe('durability', () => {
  it('everything is still there after the server restarts', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-')); const file = path.join(dir, 'db.sqlite')
    const a = await startServer({ repo: new SqliteRepo(file) })
    const c = counter(a.url); await c.login('s3', '1111')
    await c.ops([op('checkout', cashBill(a.engine.state, 'keep1')), op('addExpense', { id: 'keep2', at: new Date().toISOString(), category: 'Tea', amount: 12, note: '' })])
    const snapshot = JSON.stringify(a.engine.state)
    await a.close()
    const repo = new SqliteRepo(file); const e = await Engine.open(repo, () => { throw new Error('should not seed again') })
    expect(JSON.stringify(e.state)).toBe(snapshot)
    expect(await repo.findOp('nope')).toBeNull()
    await repo.close()
  })
})
