// Click-through of every screen and the core flows. Run: node e2e/smoke.cjs
const { chromium } = require('playwright')
const path = require('path')
const url = 'file://' + path.resolve(__dirname, '../dist-single/index.html')
;(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage()
  const errors = []; p.on('pageerror', e => errors.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|net::/.test(m.text())) errors.push(m.text()) })
  const shot = n => p.screenshot({ path: `replica/clone-screens/${n}.png` })
  const ok = []; const check = (c, msg) => { if (!c) { errors.push('FAIL ' + msg) } else ok.push(msg) }
  await p.goto(url); await shot('S01-login')
  for (const k of '9999') await p.keyboard.press(k); await p.keyboard.press('Enter')
  check(await p.getByRole('alert').isVisible(), 'wrong PIN shows error')
  for (const k of '1234') await p.keyboard.press(k); await p.keyboard.press('Enter')
  await p.waitForSelector('text=Today at the counter'); await shot('S02-dashboard'); ok.push('owner login')
  // F01 billing: scan barcode, metre item, salesman card, customer, pay
  await p.goto(url + '#/billing'); const scan = p.getByLabel('Scan or search item')
  await scan.fill('NT100107'); await scan.press('Enter')       // Kanchipuram silk, 12500
  await scan.fill('SM02'); await scan.press('Enter')
  await scan.fill('Shirting'); await p.locator('[role=listbox] button').first().click()
  await p.getByRole('button', { name: '2.5 m' }).click(); await p.getByRole('button', { name: /Add 2.5 m/ }).click()
  const rows = await p.locator('tbody tr').count(); check(rows === 2, `cart has 2 lines (got ${rows})`)
  check(await p.locator('select').first().inputValue() === 'm2', 'salesman card scan sets salesman')
  await p.getByRole('button', { name: /Add customer by mobile/ }).click(); await p.getByPlaceholder('10-digit mobile').fill('9000011111')
  await p.getByPlaceholder('Name', { exact: true }).fill('Test Customer'); await p.getByRole('button', { name: 'Save' }).click()
  check(await p.getByText('Test Customer').isVisible(), 'new customer attached')
  await shot('S03-billing')
  // hold + next customer tab
  await p.getByRole('button', { name: /Next customer/ }).click(); check(await p.getByRole('tab').count() >= 2, 'second bill tab opens')
  await p.getByRole('tab').first().click()
  await p.getByRole('button', { name: /^Pay$/ }).click(); await p.getByRole('button', { name: 'All UPI' }).click()
  await p.getByRole('button', { name: /Save & print bill/ }).click()
  await p.waitForSelector('.print-area .receipt'); await shot('S04-bill'); ok.push('checkout -> bill print view')
  check(await p.getByText('Salesman: SM02').isVisible(), 'salesman on bill')
  // credit sale over limit blocked + allowed under limit
  await p.goto(url + '#/billing'); await p.getByLabel('Scan or search item').fill('NT100114'); await p.getByLabel('Scan or search item').press('Enter')
  await p.getByRole('button', { name: /Add customer by mobile/ }).click(); await p.getByPlaceholder('10-digit mobile').fill('9000011111'); await p.locator('[role=dialog] li button').first().click()
  await p.getByRole('button', { name: /^Pay$/ }).click(); await p.locator('[role=dialog] select').first().selectOption('credit')
  await p.getByRole('button', { name: /Save & print bill/ }).click()
  check(await p.getByText(/Credit limit/).isVisible(), 'credit limit enforced (12500 > 5000)')
  await p.keyboard.press('Escape')
  // discount above cashier limit -> owner PIN (we're owner: 100%, so just apply coupon)
  await p.getByPlaceholder('e.g. WELCOME5').fill('WELCOME5'); check(await p.getByText('Welcome coupon 5%').isVisible(), 'coupon applies')
  await p.getByRole('button', { name: /Clear/ }).click()
  // other screens render
  const pages = ['bills', 'customers', 'credit', 'alterations', 'returns', 'products', 'labels', 'purchases', 'stock-count', 'suppliers', 'offers', 'salesmen', 'accounts', 'backup', 'reports', 'settings']
  for (const pg of pages) { await p.goto(url + '#/' + pg); await p.waitForTimeout(150); check(await p.locator('h1').count() > 0, `screen ${pg} renders`); await shot(pg) }
  // return -> credit note
  await p.goto(url + '#/returns'); await p.getByPlaceholder('NT-00123 or 123').fill('5'); await p.getByRole('button', { name: /Find bill/ }).click()
  await p.locator('input[type=number]').first().fill('1'); await p.getByRole('button', { name: 'Complete return' }).click()
  check(await p.getByText(/CN-0001/).first().isVisible(), 'return creates credit note')
  // labels
  await p.goto(url + '#/labels'); await p.getByRole('button', { name: 'One per piece in stock' }).click(); await p.waitForTimeout(400); await shot('labels-filled')
  check(await p.locator('img[alt^="Barcode"]').count() > 10, 'barcode labels render')
  // product entry: new product gets SKU + barcode automatically
  await p.goto(url + '#/products'); await p.getByRole('button', { name: 'Add product' }).click()
  await p.getByPlaceholder('e.g. Soft Silk Saree').fill('Test Cotton Saree'); await p.locator('[role=dialog]').getByLabel('Selling price ₹').fill('999')
  await p.getByRole('button', { name: 'Generate SKU & barcode now' }).click()
  const sku = await p.locator('[role=dialog]').getByLabel('SKU code').inputValue(); const bc = await p.locator('[role=dialog]').getByLabel('Barcode', { exact: true }).inputValue()
  check(/^[A-Z]{3}-\d{4}/.test(sku) && bc.slice(0, 3) === sku.slice(0, 3) && /^[A-Z]{2,3}\d{6}$/.test(bc), `SKU ${sku} and barcode ${bc} generated`)
  await p.getByRole('button', { name: 'Save product' }).click(); await shot('products')
  // purchase on credit -> supplier ledger
  await p.goto(url + '#/purchases'); await p.getByRole('button', { name: 'New purchase' }).click()
  await p.getByLabel('Scan or search the item received').fill(bc); await p.getByLabel('Scan or search the item received').press('Enter')
  await p.locator('[role=dialog] input[aria-label=Qty]').fill('5'); await p.locator('[role=dialog] input[aria-label="Cost each"]').fill('500')
  await p.getByPlaceholder('2500').fill('1000'); await p.getByRole('button', { name: /Save, add stock/ }).click()
  check(await p.getByText('Labels for purchase').isVisible(), 'purchase opens label printing for received items')
  check(await p.getByRole('button', { name: 'Print 5 labels' }).isVisible(), 'one label per piece received')
  await p.goto(url + '#/accounts'); await shot('accounts-summary'); await p.getByRole('tab', { name: 'Ledgers' }).click(); await shot('accounts-ledger')
  await p.getByRole('tab', { name: 'Cash book' }).click(); check(await p.getByText('Purchase paid').first().isVisible(), 'cash book shows purchase payment'); await shot('accounts-cashbook')
  await p.goto(url + '#/settings'); await p.getByRole('tab', { name: 'Role permissions' }).click(); await shot('settings-permissions')
  await p.getByLabel('cashier can open Customers').uncheck()
  // reports tabs
  await p.goto(url + '#/reports'); for (const t of ['Daily sales', 'Stock', 'Dead stock', 'Busy hours', 'Profit', 'Best sellers']) { await p.getByRole('tab', { name: t, exact: true }).click(); await shot('reports-' + t.replace(/ /g, '-').toLowerCase()) }
  // stock count
  await p.goto(url + '#/stock-count'); await p.getByRole('button', { name: /Start counting/ }).click(); await p.getByLabel(/Scan each sticker/).fill('NT100107'); await p.getByLabel(/Scan each sticker/).press('Enter'); await shot('stock-count-open')
  await p.getByRole('button', { name: 'Cancel count' }).click()
  // cashier role restrictions
  await p.goto(url + '#/'); await p.getByRole('button', { name: 'Log out' }).click(); await p.getByRole('button', { name: /Anitha/ }).click()
  for (const k of '1111') await p.keyboard.press(k); await p.keyboard.press('Enter'); await p.waitForTimeout(200)
  check(await p.getByRole('link', { name: 'Settings & staff' }).count() === 0, 'cashier cannot see settings')
  check(await p.getByRole('link', { name: 'Customers' }).count() === 0, 'permission change hides Customers from cashier')
  await p.goto(url + '#/settings'); check(await p.getByText(/can't open this screen/).isVisible(), 'cashier blocked from settings URL')
  // cashier discount over limit asks owner PIN
  await p.goto(url + '#/billing'); await p.getByLabel('Scan or search item').fill('NT100121'); await p.getByLabel('Scan or search item').press('Enter')
  await p.locator('input[placeholder="0"]').last().fill('20'); await p.locator('aside input[type=number]').first().fill('20')
  await p.getByRole('button', { name: /^Pay$/ }).click(); check(await p.getByText('Owner approval needed').isVisible(), 'big discount needs owner PIN')
  // mobile
  await p.setViewportSize({ width: 390, height: 844 }); await p.keyboard.press('Escape'); await p.goto(url + '#/'); await shot('mobile-dashboard')
  await p.goto(url + '#/billing'); await shot('mobile-billing')
  console.log('PASSED', ok.length); console.log(ok.join('\n')); if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exitCode = 1 }
  await b.close()
})()
