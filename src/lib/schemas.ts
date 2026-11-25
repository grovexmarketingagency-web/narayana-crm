/* Shapes of every record and operation argument. Used by the app before a change is queued
   and by the server before a change is accepted, so bad data cannot reach the database. */
import { z } from 'zod'

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)
const text = (max = 200) => z.string().max(max)
const name = z.string().trim().min(1).max(120)
const money = z.number().finite().min(0).max(1e9)
const qty = z.number().finite().min(0).max(1e6)
const signedQty = z.number().finite().min(-1e6).max(1e6)
const iso = z.string().max(40).refine(s => !Number.isNaN(Date.parse(s)), 'invalid date')
const day = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/)
const mobile = z.string().regex(/^\d{10}$/, '10-digit mobile number')
export const roleS = z.enum(['owner', 'manager', 'cashier', 'accountant'])
const payMode = z.enum(['cash', 'upi', 'card', 'credit', 'voucher', 'points'])
const acct = z.enum(['cash', 'bank'])

export const shopS = z.object({
  name: name, tagline: text(), address: text(300), phone: text(40), gstin: text(20), stateName: text(60), logo: text(90000).optional(), billFooter: text(400),
  garmentThreshold: money, garmentLow: z.number().min(0).max(40), garmentHigh: z.number().min(0).max(40), fabricRate: z.number().min(0).max(40), otherRate: z.number().min(0).max(40),
  pointsPer100: z.number().min(0).max(100), pointValue: z.number().min(0).max(100), lowStockDefault: qty, language: z.enum(['en', 'ta', 'ml']),
  printerWidth: z.enum(['58', '80']), labelCode: z.enum(['barcode', 'qr']), autoBackupHours: z.number().int().min(0).max(168), openingCash: z.number().finite(), openingBank: z.number().finite(),
}).strip()
export const staffS = z.object({ id, name, role: roleS, pin: z.string().regex(/^\d{4,8}$/).optional(), maxDiscountPct: z.number().min(0).max(100), active: z.boolean() }).strip()
export const productS = z.object({ id, name, category: text(60).min(1), hsn: text(12), gstType: z.enum(['garment', 'fabric', 'other']), unit: z.enum(['pcs', 'm']), brand: text(60).optional(), supplierId: id.optional(), createdAt: iso }).strip()
export const variantS = z.object({ id, productId: id, size: text(20), colour: text(40), sku: text(60), barcode: text(40), mrp: money, cost: money, stock: signedQty, lowAt: qty, createdAt: iso, lastSoldAt: iso.optional() }).strip()
export const customerS = z.object({ id, mobile, name, creditLimit: money.optional(), birthday: day.optional(), city: text(60).optional() }).strip()
export const offerS = z.object({ id, name, type: z.enum(['percent', 'bxgy', 'flat']), value: money, buyQty: z.number().int().min(0).max(100), getQty: z.number().int().min(0).max(100), minAmount: money,
  category: text(60), couponCode: text(30), startsOn: day, endsOn: day, active: z.boolean() }).strip()
export const salesmanS = z.object({ id, code: z.string().trim().min(1).max(20), name, pointsPerPiece: z.number().min(0).max(1000), commissionPct: z.number().min(0).max(100), active: z.boolean() }).strip()
export const supplierS = z.object({ id, name, mobile: text(20), gstin: text(20), city: text(60) }).strip()
export const alterationS = z.object({ id: id.optional(), customerName: name, mobile: z.string().max(10).optional(), customerId: id.optional(), item: name, work: text(500).optional(), charge: money.optional(), paid: z.boolean().optional(),
  dueDate: day, status: z.enum(['pending', 'ready', 'delivered']).optional(), tailor: text(60).optional(), billNo: text(30).optional() }).strip()
const draftLine = z.object({ variantId: id, qty: z.number().positive().max(10000), discount: money })
const payment = z.object({ mode: payMode, amount: money, ref: text(40).optional() })
const entry = z.object({ at: iso, category: z.string().trim().min(1).max(60), amount: money.refine(n => n > 0, 'amount must be above 0'), note: text(200), mode: acct.optional() })

/* one entry per operation the app can perform */
export const argsS = {
  checkout: z.object({ billId: id, lines: z.array(draftLine).min(1).max(300), customerId: id.optional(), salesmanId: id.optional(),
    billDiscount: z.object({ type: z.enum(['pct', 'amt']), value: money }), couponCode: text(30), payments: z.array(payment).min(1).max(10), approval: text(300).optional() }),
  upsertCustomer: customerS.extend({ isNew: z.boolean().optional() }),
  collectCredit: z.object({ id, customerId: id, amount: money.refine(n => n > 0), mode: payMode }),
  saveProduct: z.object({ product: productS, variants: z.array(variantS).min(1).max(500) }),
  deleteProduct: z.object({ id }),
  importProducts: z.object({ rows: z.array(z.object({ productId: id, variantId: id, sku: text(60).optional(), brand: text(60).optional(), name, category: text(60), hsn: text(12), gstType: z.enum(['garment', 'fabric', 'other']),
    unit: z.enum(['pcs', 'm']), size: text(20), colour: text(40), mrp: money, cost: money, stock: signedQty, barcode: text(40).optional() })).min(1).max(5000) }),
  addPurchase: z.object({ id, supplierId: id, invoiceNo: text(40), at: iso, lines: z.array(z.object({ variantId: id, qty: qty.refine(n => n > 0), cost: money })).min(1).max(1000), paid: money, payMode: acct }),
  startCount: z.object({ id, category: text(60) }),
  countScan: z.object({ id, variantId: id, qty: signedQty }),
  finishCount: z.object({ id, apply: z.boolean() }),
  adjustStock: z.object({ variantId: id, stock: signedQty }),
  doReturn: z.object({ id, billId: id, lines: z.array(z.object({ variantId: id, qty: qty })).min(1).max(300), refundMode: z.enum(['cash', 'credit_note']) }),
  issueGiftVoucher: z.object({ id, amount: money.refine(n => n > 0), customerId: id.optional(), note: text(200).optional(), mode: acct }),
  saveAlteration: z.object({ alteration: alterationS, newId: id.optional() }),
  saveOffer: z.object({ offer: offerS }),
  deleteOffer: z.object({ id }),
  saveSalesman: z.object({ salesman: salesmanS }),
  saveSupplier: z.object({ supplier: supplierS }),
  addExpense: entry.extend({ id }),
  deleteExpense: z.object({ id }),
  addIncome: entry.extend({ id, mode: acct }),
  deleteIncome: z.object({ id }),
  paySupplier: z.object({ id, supplierId: id, amount: money.refine(n => n > 0), mode: acct, at: iso, note: text(200) }),
  saveStaff: z.object({ staff: staffS }),
  saveShop: z.object({ shop: shopS }),
  saveSections: z.object({ sections: z.array(z.object({ name: z.string().trim().min(1).max(40), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,4}$/, 'Code must be 2 to 4 letters or digits'), was: text(40).optional() })).max(100) }),
  setShopPrefs: z.object({ labelCode: z.enum(['barcode', 'qr']).optional(), autoBackupHours: z.number().int().min(0).max(168).optional() }),
  savePermissions: z.object({ role: roleS, pages: z.array(z.string().regex(/^\/[a-z-]*$/)).max(40) }),
} as const
export type OpName = keyof typeof argsS
export type Args<N extends OpName> = z.infer<(typeof argsS)[N]>
