export type Role = 'owner' | 'manager' | 'cashier' | 'accountant'
export type GstType = 'garment' | 'fabric' | 'other'
export type Unit = 'pcs' | 'm'
export type PayMode = 'cash' | 'upi' | 'card' | 'credit' | 'voucher' | 'points'

export interface Shop {
  name: string; tagline: string; address: string; phone: string; gstin: string; stateName: string
  billFooter: string; garmentThreshold: number; garmentLow: number; garmentHigh: number; fabricRate: number; otherRate: number
  pointsPer100: number; pointValue: number; lowStockDefault: number; language: 'en' | 'ta' | 'ml'
  printerWidth: '58' | '80'; labelCode: 'barcode' | 'qr'; autoBackupHours: number; openingCash: number; openingBank: number
}
export interface Staff { id: string; name: string; role: Role; pin?: string; pinHash?: string; maxDiscountPct: number; active: boolean }
export interface Product { id: string; name: string; category: string; hsn: string; gstType: GstType; unit: Unit; brand?: string; supplierId?: string; createdAt: string }
export interface Variant { id: string; productId: string; size: string; colour: string; sku: string; barcode: string; mrp: number; cost: number; stock: number; lowAt: number; createdAt: string; lastSoldAt?: string }
export interface Customer { id: string; mobile: string; name: string; points: number; creditLimit: number; balance: number; birthday?: string; city?: string; createdAt: string }
export interface Salesman { id: string; code: string; name: string; pointsPerPiece: number; commissionPct: number; active: boolean }
export interface Supplier { id: string; name: string; mobile: string; gstin: string; city: string }

export interface BillLine {
  variantId: string; productName: string; variantLabel: string; hsn: string; unit: Unit; category: string
  qty: number; mrp: number; gross: number; discount: number; net: number; gstRate: number; taxable: number; tax: number; cost: number; salesmanId?: string
}
export interface Payment { mode: PayMode; amount: number; ref?: string }
export interface Bill {
  id: string; no: string; at: string; staffId: string; customerId?: string; salesmanId?: string
  lines: BillLine[]; gross: number; discount: number; offerLabel?: string; couponCode?: string
  total: number; taxable: number; tax: number; roundOff: number; payments: Payment[]
  status: 'paid' | 'credit' | 'partial'; pointsEarned: number; pointsRedeemed: number; returnedAmount: number
}

export interface DraftLine { variantId: string; qty: number; discount: number }
export interface Draft {
  id: string; label: string; lines: DraftLine[]; customerId?: string; salesmanId?: string
  billDiscount: { type: 'pct' | 'amt'; value: number }; couponCode: string; held: boolean; createdAt: string
}

export type OfferType = 'percent' | 'bxgy' | 'flat'
export interface Offer {
  id: string; name: string; type: OfferType; value: number; buyQty: number; getQty: number; minAmount: number
  category: string /* '' = all */; couponCode: string; startsOn: string; endsOn: string; active: boolean
}
export interface Voucher { id: string; code: string; kind: 'gift' | 'credit_note'; amount: number; balance: number; customerId?: string; createdAt: string; note?: string }
export interface Alteration {
  id: string; no: string; customerName: string; mobile: string; customerId?: string; item: string; work: string
  charge: number; paid: boolean; dueDate: string; status: 'pending' | 'ready' | 'delivered'; tailor: string; createdAt: string; billNo?: string
}
export interface PurchaseLine { variantId: string; qty: number; cost: number }
export interface Purchase { id: string; no: string; supplierId: string; invoiceNo: string; at: string; lines: PurchaseLine[]; total: number; paid: number; payMode: AcctMode }
export interface StockCount { id: string; startedAt: string; status: 'open' | 'applied' | 'cancelled'; scanned: Record<string, number>; category: string }
export type AcctMode = 'cash' | 'bank'
export interface Expense { id: string; at: string; category: string; amount: number; note: string; mode?: AcctMode }
export interface Income { id: string; at: string; category: string; amount: number; note: string; mode: AcctMode }
export interface SupplierPayment { id: string; supplierId: string; amount: number; mode: AcctMode; at: string; note: string }
export interface CreditPayment { id: string; customerId: string; amount: number; mode: PayMode; at: string }
export interface ReturnRec {
  id: string; no: string; billId: string; billNo: string; at: string; lines: { variantId: string; label: string; qty: number; amount: number }[]
  amount: number; refundMode: 'cash' | 'credit_note'; voucherCode?: string
}
export interface Audit { id: string; at: string; staffId: string; action: string; detail: string }

export interface DB {
  version: number; shop: Shop; staff: Staff[]; products: Product[]; variants: Variant[]; customers: Customer[]
  salesmen: Salesman[]; suppliers: Supplier[]; bills: Bill[]; drafts: Draft[]; offers: Offer[]; vouchers: Voucher[]
  alterations: Alteration[]; purchases: Purchase[]; stockCounts: StockCount[]; expenses: Expense[]
  creditPayments: CreditPayment[]; returns: ReturnRec[]; audit: Audit[]; counters: Record<string, number>
  incomes: Income[]; supplierPayments: SupplierPayment[]; permissions: Record<Role, string[]>
}
