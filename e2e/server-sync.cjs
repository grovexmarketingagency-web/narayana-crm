// Two counters on one central database, including a counter that loses the network mid-bill.
// Starts its own server on a fresh database:  node e2e/server-sync.cjs   (after npm run build)
const { chromium } = require('playwright')
const { spawn } = require('node:child_process')
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path')

const PORT = 4590, U = `http://localhost:${PORT}`
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-sync-'))
const srv = spawn(process.execPath, ['--no-warnings', 'server/dist/index.mjs'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, SEED_DEMO: '1' }, stdio: 'inherit' })
const wait = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(U + '/api/health')).ok) break } catch { /* starting */ } await wait(200) }
  const b = await chromium.launch(); const errs = []; const ok = []
  const check = (c, m) => (c ? ok : errs).push(m)
  async function counter(pin, who) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage()
    p.on('pageerror', e => errs.push('pageerror ' + e.message))
    await p.goto(U); await p.waitForSelector('text=Enter PIN'); await p.waitForTimeout(800)
    if (who) await p.getByRole('button', { name: new RegExp(who) }).click()
    for (const k of pin) await p.keyboard.press(k); await p.keyboard.press('Enter')
    await p.waitForSelector('text=Today at the counter'); return { p, ctx }
  }
  // what the central database has (read with the counter's own login)
  const serverState = p => p.evaluate(async () => (await (await fetch('./api/changes?since=0')).json()).changes)
  const stockOn = async (p, code) => (await serverState(p)).find(r => r.c === 'variants' && r.d.barcode === code).d.stock
  const billsOn = async p => (await serverState(p)).filter(r => r.c === 'bills').map(r => r.d)
  const sell = async (p, code) => {
    await p.getByRole('link', { name: 'Billing' }).click(); const s = p.getByLabel('Scan or search item'); await s.fill(code); await s.press('Enter')
    await p.getByRole('button', { name: /^Pay$/ }).click(); await p.getByRole('button', { name: 'All CASH' }).click(); await p.getByRole('button', { name: /Save & print bill/ }).click(); await p.waitForSelector('.print-area .receipt')
    return p.url().split('/bills/')[1]
  }

  const A = await counter('1234')
  check(await A.p.getByText('Central database · saved').isVisible(), 'counter A connected to central database')
  const B = await counter('1111', 'Anitha')
  check(await B.p.getByText('Demo PINs').count() === 0, 'login screen hides demo PINs on the central server')
  const code = 'NT100121'
  const before = await stockOn(A.p, code)
  const [ida, idb] = await Promise.all([sell(A.p, code), sell(B.p, code)])
  await A.p.waitForTimeout(5500)
  const bills = await billsOn(A.p)
  const ba = bills.find(x => x.id === ida), bb = bills.find(x => x.id === idb)
  check(ba && bb && ba.no !== bb.no, `two counters got different bill numbers (${ba?.no}, ${bb?.no})`)
  check(await stockOn(A.p, code) === before - 2, `central stock ${before} -> ${before - 2}`)
  check(bb && bb.staffId === 's3', 'bill from counter B is recorded under the cashier who logged in there')
  const shownB = await B.p.locator('h1').first().textContent()
  check(shownB.includes(bb?.no), `counter B shows the confirmed number (${shownB})`)

  // counter B loses the network, bills anyway, then the browser tab is closed before the network returns
  await B.ctx.setOffline(true)
  const idOff = await sell(B.p, code)
  await B.p.waitForTimeout(600)
  check(await B.p.getByText(/Waiting for the central database/).isVisible(), 'offline bill is saved on the counter and marked as waiting')
  check(await B.p.getByText(/changes waiting/).isVisible(), 'header shows changes waiting')
  check(!(await billsOn(A.p)).some(x => x.id === idOff), 'central database does not have the offline bill yet')
  await B.p.close()
  await B.ctx.setOffline(false)
  const B2 = await B.ctx.newPage(); B2.on('pageerror', e => errs.push('pageerror ' + e.message))
  await B2.goto(U); await B2.waitForSelector('text=Today at the counter', { timeout: 15000 })
  await B2.waitForTimeout(5000)
  const after = await billsOn(A.p)
  check(after.filter(x => x.id === idOff).length === 1, 'offline bill reached the central database exactly once after the tab was reopened')
  check(await stockOn(A.p, code) === before - 3, 'stock includes the offline bill')

  // owner-only server functions and permissions are enforced by the server, not just hidden in the app
  const forged = await B2.evaluate(async () => (await fetch('./api/ops', { method: 'POST', headers: { 'content-type': 'application/json', 'x-narayana': '1' }, body: JSON.stringify({ since: 0, ops: [{ id: 'forge123', name: 'saveShop', args: { shop: { name: 'X' } }, at: new Date().toISOString() }] }) })).json())
  check(forged.results[0].ok === false, 'server refuses a cashier changing shop settings directly')
  check((await B2.evaluate(async () => (await fetch('./api/backups')).status)) === 403, 'cashier cannot list server backups')

  await A.p.goto(U + '/#/backup'); await A.p.waitForTimeout(800)
  check(await A.p.getByText('Connected to the shop').isVisible(), 'backup screen shows central database')
  check((await A.p.evaluate(async () => (await (await fetch('./api/backups')).json()).length)) >= 1, 'server wrote a backup')
  await A.p.screenshot({ path: 'replica/clone-screens/backup-server.png', fullPage: true })

  console.log('PASSED', ok.length + '\n' + ok.join('\n')); if (errs.length) { console.log('ERRORS\n' + errs.join('\n')); process.exitCode = 1 }
  await b.close(); srv.kill('SIGTERM')
})().catch(e => { console.error(e); srv.kill(); process.exit(1) })
