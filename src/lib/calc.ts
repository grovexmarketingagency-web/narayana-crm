import type { DB, Draft, BillLine, Offer, Shop, GstType } from './types'
import { r2, localToday } from './format'

export function gstRateFor(shop: Shop, type: GstType, unitNet: number) {
  if (type === 'garment') return unitNet > shop.garmentThreshold ? shop.garmentHigh : shop.garmentLow
  if (type === 'fabric') return shop.fabricRate
  return shop.otherRate
}

interface Raw { variantId: string; productName: string; variantLabel: string; hsn: string; unit: 'pcs' | 'm'; category: string; gstType: GstType; qty: number; mrp: number; cost: number; gross: number; lineDisc: number }

function offerValue(o: Offer, raws: Raw[], afterLine: number): number {
  const scoped = raws.filter(r => !o.category || r.category === o.category)
  const scopedAmt = scoped.reduce((s, r) => s + r.gross - r.lineDisc, 0)
  if (o.type === 'percent') return scopedAmt >= o.minAmount ? r2(scopedAmt * o.value / 100) : 0
  if (o.type === 'flat') return afterLine >= o.minAmount ? Math.min(o.value, afterLine) : 0
  // buy X get Y: count pieces in scope, cheapest units are free
  const units: number[] = []
  scoped.forEach(r => { if (r.unit === 'pcs') for (let i = 0; i < Math.floor(r.qty); i++) units.push((r.gross - r.lineDisc) / r.qty) })
  const set = o.buyQty + o.getQty
  if (set <= 0 || units.length < set) return 0
  units.sort((a, b) => a - b)
  const free = Math.floor(units.length / set) * o.getQty
  return r2(units.slice(0, free).reduce((s, x) => s + x, 0))
}

export function activeOffers(db: DB) {
  const t = localToday()
  return db.offers.filter(o => o.active && (!o.startsOn || o.startsOn <= t) && (!o.endsOn || o.endsOn >= t))
}

export interface Computed {
  lines: BillLine[]; gross: number; lineDiscount: number; billDiscount: number; offerDiscount: number; offerLabel?: string
  couponValid: boolean; couponMsg?: string; discount: number; taxable: number; tax: number; roundOff: number; total: number
  taxByRate: { rate: number; taxable: number; tax: number }[]; pieces: number; errors: string[]
}

export function computeDraft(db: DB, draft: Draft): Computed {
  const errors: string[] = []
  const raws: Raw[] = []
  for (const l of draft.lines) {
    const v = db.variants.find(x => x.id === l.variantId); if (!v) continue
    const p = db.products.find(x => x.id === v.productId)!
    const gross = r2(v.mrp * l.qty)
    raws.push({ variantId: v.id, productName: p.name, variantLabel: [v.size, v.colour].filter(Boolean).join(' / '), hsn: p.hsn, unit: p.unit,
      category: p.category, gstType: p.gstType, qty: l.qty, mrp: v.mrp, cost: v.cost, gross, lineDisc: Math.min(l.discount || 0, gross) })
    if (l.qty > v.stock) errors.push(`${p.name} ${v.size}: only ${v.stock} in stock`)
  }
  const gross = r2(raws.reduce((s, r) => s + r.gross, 0))
  const lineDiscount = r2(raws.reduce((s, r) => s + r.lineDisc, 0))
  const afterLine = gross - lineDiscount

  // offers: coupon offers only when code typed; otherwise best automatic offer
  let offerDiscount = 0, offerLabel: string | undefined, couponValid = false, couponMsg: string | undefined
  const offers = activeOffers(db)
  const code = draft.couponCode.trim().toUpperCase()
  if (code) {
    const o = offers.find(x => x.couponCode.toUpperCase() === code)
    if (!o) couponMsg = 'Coupon not found or expired'
    else { const v = offerValue(o, raws, afterLine); if (v > 0) { offerDiscount = v; offerLabel = o.name; couponValid = true } else couponMsg = 'Coupon conditions not met' }
  }
  if (!couponValid) {
    for (const o of offers.filter(x => !x.couponCode)) {
      const v = offerValue(o, raws, afterLine); if (v > offerDiscount) { offerDiscount = v; offerLabel = o.name }
    }
  }
  const afterOffer = Math.max(0, afterLine - offerDiscount)
  const bd = draft.billDiscount
  const billDiscount = r2(Math.min(afterOffer, bd.type === 'pct' ? afterOffer * (bd.value || 0) / 100 : (bd.value || 0)))
  const extra = offerDiscount + billDiscount

  // distribute offer + bill discount over lines by value, then GST per line on unit price after discount
  const lines: BillLine[] = raws.map(r => {
    const base = r.gross - r.lineDisc
    const share = afterLine > 0 ? extra * base / afterLine : 0
    const net = r2(base - share)
    const unitNet = r.qty > 0 ? net / r.qty : 0
    const gstRate = gstRateFor(db.shop, r.gstType, unitNet)
    const taxable = r2(net / (1 + gstRate / 100))
    return { variantId: r.variantId, productName: r.productName, variantLabel: r.variantLabel, hsn: r.hsn, unit: r.unit, category: r.category,
      qty: r.qty, mrp: r.mrp, gross: r.gross, discount: r2(r.gross - net), net, gstRate, taxable, tax: r2(net - taxable), cost: r2(r.cost * r.qty), salesmanId: draft.salesmanId }
  })
  const netSum = r2(lines.reduce((s, l) => s + l.net, 0))
  const total = Math.round(netSum)
  const map = new Map<number, { rate: number; taxable: number; tax: number }>()
  lines.forEach(l => { const m = map.get(l.gstRate) || { rate: l.gstRate, taxable: 0, tax: 0 }; m.taxable = r2(m.taxable + l.taxable); m.tax = r2(m.tax + l.tax); map.set(l.gstRate, m) })
  return {
    lines, gross, lineDiscount, billDiscount, offerDiscount, offerLabel, couponValid, couponMsg,
    discount: r2(gross - netSum), taxable: r2(lines.reduce((s, l) => s + l.taxable, 0)), tax: r2(lines.reduce((s, l) => s + l.tax, 0)),
    roundOff: r2(total - netSum), total, taxByRate: [...map.values()].sort((a, b) => a.rate - b.rate),
    pieces: lines.reduce((s, l) => s + (l.unit === 'pcs' ? l.qty : 1), 0), errors,
  }
}
