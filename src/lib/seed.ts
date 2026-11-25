import type { DB, Product, Variant, Customer, Bill, Draft } from './types'
import { computeDraft } from './calc'
import { migrate } from './migrate'
import { DEFAULT_LOGO } from './logo'

let s = 42
const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
const daysAgo = (n: number, h = 11, m = 0) => { const x = new Date(); x.setDate(x.getDate() - n); x.setHours(h, m, 0, 0); return x.toISOString() }

type P = [string, string, string, 'garment' | 'fabric' | 'other', 'pcs' | 'm', string[], string[], number, number, number?]
// name, category, hsn, gstType, unit, sizes, colours, mrp, costRatio, ageDays
const CATALOG: P[] = [
  ['Kanchipuram Silk Saree', 'Sarees', '5007', 'garment', 'pcs', ['Free'], ['Maroon', 'Bottle Green', 'Mustard'], 12500, 0.68],
  ['Soft Silk Saree', 'Sarees', '5007', 'garment', 'pcs', ['Free'], ['Peach', 'Navy', 'Rani Pink'], 3450, 0.62],
  ['Chettinad Cotton Saree', 'Sarees', '5208', 'garment', 'pcs', ['Free'], ['Ivory', 'Indigo', 'Rust'], 1290, 0.58],
  ['Printed Chiffon Saree', 'Sarees', '5407', 'garment', 'pcs', ['Free'], ['Lavender', 'Teal'], 899, 0.55],
  ['Banarasi Georgette Saree', 'Sarees', '5407', 'garment', 'pcs', ['Free'], ['Wine', 'Gold'], 4800, 0.64, 140],
  ['Anarkali Kurti', 'Kurtis', '6204', 'garment', 'pcs', ['S', 'M', 'L', 'XL'], ['Mint', 'Coral'], 1199, 0.5],
  ['Straight Cotton Kurti', 'Kurtis', '6204', 'garment', 'pcs', ['S', 'M', 'L', 'XL', 'XXL'], ['Black', 'Yellow'], 649, 0.48],
  ['Salwar Suit Set', 'Salwar', '6204', 'garment', 'pcs', ['M', 'L', 'XL'], ['Sky Blue', 'Magenta'], 1850, 0.55],
  ['Bridal Lehenga', 'Lehenga', '6204', 'garment', 'pcs', ['M', 'L'], ['Red', 'Pastel Pink'], 18900, 0.7, 120],
  ['Formal Cotton Shirt', "Men's Wear", '6205', 'garment', 'pcs', ['38', '40', '42', '44'], ['White', 'Light Blue'], 899, 0.5],
  ['Linen Kurta', "Men's Wear", '6211', 'garment', 'pcs', ['M', 'L', 'XL'], ['Beige', 'Olive'], 1499, 0.52],
  ['Silk Dhoti with Angavastram', "Men's Wear", '6211', 'garment', 'pcs', ['Free'], ['Cream Gold'], 2200, 0.6],
  ['Kids Party Frock', 'Kids Wear', '6209', 'garment', 'pcs', ['2-3Y', '4-5Y', '6-7Y'], ['Pink', 'Lilac'], 799, 0.5],
  ['Boys Kurta Pyjama', 'Kids Wear', '6209', 'garment', 'pcs', ['4-5Y', '6-7Y', '8-9Y'], ['Yellow', 'Green'], 699, 0.5, 200],
  ['Shirting Fabric (Cotton)', 'Fabric', '5208', 'fabric', 'm', [''], ['White', 'Checks'], 180, 0.55],
  ['Suiting Fabric (Poly-Viscose)', 'Fabric', '5515', 'fabric', 'm', [''], ['Charcoal', 'Navy'], 420, 0.6],
  ['Running Material (Rayon)', 'Fabric', '5516', 'fabric', 'm', [''], ['Floral Blue', 'Floral Red'], 140, 0.5],
  ['Blouse Piece (Silk)', 'Fabric', '5007', 'fabric', 'm', [''], ['Maroon', 'Gold', 'Green'], 260, 0.55],
]

export function buildSeed(): DB {
  s = 42
  const products: Product[] = []; const variants: Variant[] = []
  let bc = 100100
  CATALOG.forEach(([name, category, hsn, gstType, unit, sizes, colours, mrp, ratio, age], i) => {
    const id = 'p' + (i + 1)
    const supplierId = category === 'Sarees' || name.includes('Silk') ? 'sup1' : category === 'Fabric' ? 'sup3' : 'sup2'
    const brand = category === 'Sarees' ? 'Narayana Weaves' : category === 'Fabric' ? pick(['Raymond-style Mills', 'House Fabric']) : pick(['Narayana Own', 'Kalyani Fashions', 'Tiny Tots'])
    products.push({ id, name, category, hsn, gstType, unit, brand, supplierId, createdAt: daysAgo(age ?? 60) })
    sizes.forEach(size => colours.forEach(colour => {
      bc += 7
      variants.push({ id: 'v' + bc, productId: id, size, colour, sku: '', barcode: 'NT' + bc, mrp, cost: Math.round(mrp * ratio),
        stock: unit === 'm' ? 40 + Math.round(rnd() * 80) : 2 + Math.floor(rnd() * 12), lowAt: unit === 'm' ? 15 : 3, createdAt: daysAgo(age ?? 60) })
    }))
  })
  const names = ['Lakshmi Narayanan', 'Priya Sundaram', 'Meena Krishnan', 'Arun Kumar', 'Kavitha Raman', 'Sanjay Iyer', 'Divya Shankar', 'Revathi Ganesh', 'Farida Begum', 'Joseph Mathew']
  const customers: Customer[] = names.map((n, i) => ({ id: 'c' + (i + 1), mobile: '98' + String(40000000 + i * 1234567).slice(0, 8), name: n,
    points: 0, creditLimit: i % 3 === 0 ? 15000 : 5000, balance: 0, city: pick(['Erode', 'Salem', 'Tiruppur', 'Coimbatore']), createdAt: daysAgo(90), birthday: `1990-${String((i % 12) + 1).padStart(2, '0')}-1${i % 9}` }))

  const db: DB = {
    version: 1,
    shop: { name: 'Narayana Textiles', tagline: 'Silks, sarees & family wear', address: 'Puthiyakotta, Kanhangad, Kasaragod Dist, Pin 671315', phone: '9961181641, 8075715654', logo: DEFAULT_LOGO,
      gstin: '32ABCDE1234F1Z5', stateName: 'Kerala (32)', billFooter: 'Thank you for shopping with us! Exchange within 7 days with bill & tag.',
      garmentThreshold: 2500, garmentLow: 5, garmentHigh: 18, fabricRate: 5, otherRate: 12, pointsPer100: 1, pointValue: 1, lowStockDefault: 3, language: 'en', printerWidth: '80', labelCode: 'barcode', autoBackupHours: 24, openingCash: 25000, openingBank: 150000, sections: [] },
    staff: [
      { id: 's1', name: 'Owner', role: 'owner', pin: '1234', maxDiscountPct: 100, active: true },
      { id: 's2', name: 'Ravi (Manager)', role: 'manager', pin: '2222', maxDiscountPct: 15, active: true },
      { id: 's3', name: 'Anitha (Cashier)', role: 'cashier', pin: '1111', maxDiscountPct: 5, active: true },
      { id: 's4', name: 'Auditor (Accountant)', role: 'accountant', pin: '0000', maxDiscountPct: 0, active: true },
    ],
    products, variants, customers,
    salesmen: [
      { id: 'm1', code: 'SM01', name: 'Murugan', pointsPerPiece: 2, commissionPct: 1, active: true },
      { id: 'm2', code: 'SM02', name: 'Selvi', pointsPerPiece: 2, commissionPct: 1, active: true },
      { id: 'm3', code: 'SM03', name: 'Karthik', pointsPerPiece: 2, commissionPct: 1, active: true },
      { id: 'm4', code: 'SM04', name: 'Deepa', pointsPerPiece: 2, commissionPct: 1, active: true },
    ],
    suppliers: [
      { id: 'sup1', name: 'Sri Murugan Silks, Kanchipuram', mobile: '9443012345', gstin: '33AAACS1111A1Z1', city: 'Kanchipuram' },
      { id: 'sup2', name: 'Tiruppur Knit Garments', mobile: '9842098420', gstin: '33AAACT2222B1Z2', city: 'Tiruppur' },
      { id: 'sup3', name: 'Surat Fabric House', mobile: '9825011223', gstin: '24AAACF3333C1Z3', city: 'Surat' },
    ],
    bills: [], drafts: [],
    offers: [
      { id: 'o1', name: 'Deepavali 10% off Sarees', type: 'percent', value: 10, buyQty: 0, getQty: 0, minAmount: 0, category: 'Sarees', couponCode: '', startsOn: '', endsOn: '', active: false },
      { id: 'o2', name: 'Kids Wear Buy 2 Get 1', type: 'bxgy', value: 0, buyQty: 2, getQty: 1, minAmount: 0, category: 'Kids Wear', couponCode: '', startsOn: '', endsOn: '', active: true },
      { id: 'o3', name: '₹300 off above ₹5000', type: 'flat', value: 300, buyQty: 0, getQty: 0, minAmount: 5000, category: '', couponCode: '', startsOn: '', endsOn: '', active: true },
      { id: 'o4', name: 'Welcome coupon 5%', type: 'percent', value: 5, buyQty: 0, getQty: 0, minAmount: 1000, category: '', couponCode: 'WELCOME5', startsOn: '', endsOn: '', active: true },
    ],
    vouchers: [{ id: 'gv1', code: 'GIFT-2001', kind: 'gift', amount: 2000, balance: 2000, createdAt: daysAgo(10), note: 'Sold at counter' }],
    alterations: [], purchases: [], stockCounts: [], expenses: [], creditPayments: [], returns: [], audit: [], incomes: [], supplierPayments: [], permissions: undefined as unknown as DB['permissions'],
    counters: { bill: 0, alt: 0, pur: 0, ret: 0, cn: 0, gv: 2001 },
  }

  // history: ~30 days of bills so dashboards and reports have something to show
  const sellable = variants.filter(v => !['p5', 'p9', 'p14'].includes(v.productId) || rnd() < 0.1)
  for (let day = 30; day >= 0; day--) {
    const n = day === 0 ? 6 : 3 + Math.floor(rnd() * 6)
    for (let k = 0; k < n; k++) {
      const hour = pick([10, 11, 11, 12, 13, 16, 17, 18, 18, 19, 19, 20])
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => {
        const v = pick(sellable); const p = products.find(x => x.id === v.productId)!
        return { variantId: v.id, qty: p.unit === 'm' ? pick([1.5, 2, 2.5, 3, 4.5]) : 1, discount: 0 }
      }).filter((l, i, a) => a.findIndex(x => x.variantId === l.variantId) === i)
      const cust = rnd() < 0.6 ? pick(customers) : undefined
      const draft: Draft = { id: 'd', label: '', lines, customerId: cust?.id, salesmanId: pick(['m1', 'm2', 'm3', 'm4']),
        billDiscount: { type: 'pct', value: rnd() < 0.2 ? 5 : 0 }, couponCode: '', held: false, createdAt: '' }
      lines.forEach(l => { const v = variants.find(x => x.id === l.variantId)!; v.stock += l.qty })  // seed stock so sale fits
      const c = computeDraft(db, draft)
      const credit = cust && rnd() < 0.08 ? Math.round(c.total * 0.5) : 0
      db.counters.bill++
      const at = daysAgo(day, hour, Math.floor(rnd() * 59))
      const bill: Bill = { id: 'b' + db.counters.bill, no: 'NT-' + String(db.counters.bill).padStart(5, '0'), at, staffId: 's3', customerId: cust?.id, salesmanId: draft.salesmanId,
        lines: c.lines, gross: c.gross, discount: c.discount, offerLabel: c.offerLabel, total: c.total, taxable: c.taxable, tax: c.tax, roundOff: c.roundOff,
        payments: credit ? [{ mode: 'cash', amount: c.total - credit }, { mode: 'credit', amount: credit }] : [{ mode: pick(['cash', 'upi', 'upi', 'card']), amount: c.total }],
        status: credit ? 'partial' : 'paid', pointsEarned: cust ? Math.floor(c.total / 100) : 0, pointsRedeemed: 0, returnedAmount: 0 }
      db.bills.push(bill)
      lines.forEach(l => { const v = variants.find(x => x.id === l.variantId)!; v.stock -= l.qty; v.lastSoldAt = at })
      if (cust) { cust.points += bill.pointsEarned; cust.balance += credit }
    }
    if (day % 3 === 0) db.expenses.push({ id: 'e' + day, at: daysAgo(day, 9), category: pick(['Tea & snacks', 'Electricity', 'Transport', 'Packing covers']), amount: pick([150, 320, 800, 1200]), note: '' })
  }
  db.expenses.push({ id: 'erent', at: daysAgo(5, 9), category: 'Rent', amount: 45000, note: 'Monthly rent' })
  db.expenses.push({ id: 'esal', at: daysAgo(5, 9), category: 'Salaries', amount: 68000, note: 'Staff salaries' })
  // make some dead stock: never sold old items
  variants.filter(v => ['p5', 'p14'].includes(v.productId)).forEach(v => { delete v.lastSoldAt })
  // a couple of low stock items
  variants[3].stock = 1; variants[20].stock = 2
  db.alterations = [
    { id: 'a1', no: 'ALT-001', customerName: 'Priya Sundaram', mobile: customers[1].mobile, customerId: 'c2', item: 'Saree blouse', work: 'Stitch blouse with lining, puff sleeves', charge: 650, paid: false, dueDate: daysAgo(-2).slice(0, 10), status: 'pending', tailor: 'Mani', createdAt: daysAgo(3) },
    { id: 'a2', no: 'ALT-002', customerName: 'Arun Kumar', mobile: customers[3].mobile, customerId: 'c4', item: 'Formal shirt', work: 'Sleeve shorten 1 inch', charge: 80, paid: true, dueDate: daysAgo(0).slice(0, 10), status: 'ready', tailor: 'Mani', createdAt: daysAgo(2) },
    { id: 'a3', no: 'ALT-003', customerName: 'Kavitha Raman', mobile: customers[4].mobile, customerId: 'c5', item: 'Salwar set', work: 'Fit waist, hem pant', charge: 250, paid: false, dueDate: daysAgo(1).slice(0, 10), status: 'pending', tailor: 'Lakshmi', createdAt: daysAgo(4) },
  ]
  db.counters.alt = 3
  const pur = (no: number, sup: string, inv: string, day: number, pids: string[], qty: number, paidPct: number) => {
    const lines = variants.filter(v => pids.includes(v.productId)).map(v => ({ variantId: v.id, qty, cost: v.cost }))
    const total = lines.reduce((s, l) => s + l.qty * l.cost, 0)
    db.purchases.push({ id: 'pu' + no, no: 'PUR-00' + no, supplierId: sup, invoiceNo: inv, at: daysAgo(day, 15), lines, total, paid: Math.round(total * paidPct), payMode: 'bank' })
  }
  pur(1, 'sup1', 'SMS/2211', 25, ['p1'], 3, 1); pur(2, 'sup2', 'TKG/889', 14, ['p6', 'p7'], 4, 0.5); pur(3, 'sup3', 'SFH/5520', 6, ['p15', 'p16'], 30, 0)
  db.counters.pur = 3
  db.supplierPayments.push({ id: 'sp1', supplierId: 'sup2', amount: 5000, mode: 'cash', at: daysAgo(4, 12), note: 'Part payment' })
  db.incomes.push({ id: 'i1', at: daysAgo(8, 12), category: 'Tailoring charges', amount: 1850, mode: 'cash', note: 'Blouse stitching' }, { id: 'i2', at: daysAgo(2, 12), category: 'Old stock sale (bulk)', amount: 6000, mode: 'bank', note: 'Remnant fabric' })
  db.expenses.forEach(e => { e.mode = e.amount >= 10000 ? 'bank' : 'cash' })
  return migrate(db)
}

/** A fresh shop with one owner and no products, bills or customers. Used when a new central database is set up. */
export function blankDB(shopName: string, ownerName: string, ownerPin: string): DB {
  const db = buildSeed()
  for (const k of ['products', 'variants', 'customers', 'salesmen', 'suppliers', 'bills', 'drafts', 'offers', 'vouchers', 'alterations', 'purchases', 'stockCounts',
    'expenses', 'creditPayments', 'returns', 'audit', 'incomes', 'supplierPayments'] as const) (db[k] as unknown[]) = []
  db.counters = {}
  db.shop = { ...db.shop, name: shopName, gstin: '', openingCash: 0, openingBank: 0, sections: [] }
  db.staff = [{ id: 's1', name: ownerName, role: 'owner', pin: ownerPin, maxDiscountPct: 100, active: true }]
  return db
}
