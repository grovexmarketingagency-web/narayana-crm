/* Owner two-step login: PIN plus a 6-digit authenticator code. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { checkTotp, totpAt } from '../server/src/auth'
import { startServer, counter, op } from './helpers'

let srv: Awaited<ReturnType<typeof startServer>>
beforeAll(async () => { srv = await startServer() })
afterAll(async () => { await srv.close() })
const stepNow = () => Math.floor(Date.now() / 30e3)

describe('authenticator codes', () => {
  it('matches the RFC 6238 test vector', () => {
    // RFC 6238 appendix B, SHA1 secret "12345678901234567890" in base32, T = 59 s
    expect(totpAt('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1)).toBe('287082')
    expect(checkTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', 0, 59e3)).toBe(1)
    expect(checkTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', 1, 59e3)).toBeNull()   // used once already
    expect(checkTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '28708', 0, 59e3)).toBeNull()
  })
})

describe('two-step login', () => {
  let secret = ''
  it('only the owner can set it up', async () => {
    const m = counter(srv.url); await m.login('s2', '2222')
    expect((await m.call('/2fa/setup', {})).status).toBe(403)
  })
  it('turns on only with a correct code', async () => {
    const o = counter(srv.url); await o.login('s1', '1234')
    const r = await o.call('/2fa/setup', {})
    expect(r.status).toBe(200); expect(r.body.uri).toMatch(/^otpauth:\/\/totp\//)
    secret = r.body.secret
    expect((await o.call('/2fa/enable', { code: '000000' === totpAt(secret, stepNow()) ? '111111' : '000000' })).status).toBe(400)
    expect((await o.call('/2fa/enable', { code: totpAt(secret, stepNow()) })).status).toBe(200)
    expect(srv.engine.staff('s1')?.totpSecret).toBe(secret)
  })
  it('the secret never reaches counters, only that it is on', async () => {
    const c = counter(srv.url); await c.login('s3', '1111')
    const hello = await c.call('/hello')
    expect(hello.body.staff.find((s: { id: string }) => s.id === 's1').twoStep).toBe(true)
    const all = JSON.stringify((await c.call('/changes?since=0')).body)
    expect(all).not.toContain(secret); expect(all).not.toMatch(/totp/i)
  })
  it('the PIN alone is refused; PIN plus code works once', async () => {
    const c = counter(srv.url)
    const r = await c.login('s1', '1234')
    expect(r.status).toBe(401); expect(r.body.error).toMatch(/6-digit code/)
    const code = totpAt(secret, stepNow() + 1)
    expect((await c.call('/login', { staffId: 's1', pin: '1234', code })).status).toBe(200)
    expect((await counter(srv.url).call('/login', { staffId: 's1', pin: '1234', code })).status).toBe(401)   // a code cannot be replayed
    expect((await counter(srv.url).call('/login', { staffId: 's1', pin: '9999', code })).body.error).toMatch(/PIN/)
  })
  it('saving the owner on the staff screen keeps two-step login on', async () => {
    const o = counter(srv.url)
    await srv.engine.updateStaff('s1', x => { x.totpLastStep = 0 })
    expect((await o.call('/login', { staffId: 's1', pin: '1234', code: totpAt(secret, stepNow()) })).status).toBe(200)
    const s = srv.engine.staff('s1')!
    const r = await o.ops([op('saveStaff', { staff: { id: 's1', name: s.name, role: 'owner', maxDiscountPct: s.maxDiscountPct, active: true, totpSecret: 'AAAA' } })])
    expect(r.body.results[0].ok).toBe(true)
    expect(srv.engine.staff('s1')?.totpSecret).toBe(secret)
  })
  it('turns off only with a correct code', async () => {
    await srv.engine.updateStaff('s1', x => { x.totpLastStep = 0 })
    const o = counter(srv.url); await o.call('/login', { staffId: 's1', pin: '1234', code: totpAt(secret, stepNow() - 1) })
    expect((await o.call('/2fa/disable', { code: '12345' })).status).toBe(400)
    expect((await o.call('/2fa/disable', { code: totpAt(secret, stepNow() + 1) })).status).toBe(200)
    expect(srv.engine.staff('s1')?.totpSecret).toBeUndefined()
    expect((await counter(srv.url).login('s1', '1234')).status).toBe(200)
  })
})
