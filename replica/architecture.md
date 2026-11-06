# Architecture: Narayana Textiles CRM + POS

## Stack (first build)

| layer | choice | why |
| --- | --- | --- |
| web app | React 18 + Vite + TypeScript | fast, single bundle, runs on any counter PC or tablet browser |
| routing | hash router | works from a file, a static host, or an Artifact link |
| styling | Tailwind with design tokens (CSS variables) | brand values in one place |
| icons | lucide-react (ISC) | open icon set, no borrowed assets |
| QR | `qrcode` npm | stickers and salesman cards |
| data | local-first store (`src/lib/store.ts`) saved in the browser | billing works offline by design; same functions get pointed at a server next |
| next step backend | Postgres (Supabase) + auth, sync queue for offline bills | multi-counter, backups, accountant login from anywhere |

## Data layer contract

All screens call `db.*` functions in `src/lib/store.ts` (createBill, addPurchase, collectPayment, ...). Swapping to a server means
re-implementing these functions with the same signatures; no screen code changes.

## Schema (target Postgres, mirrored as TS types in `src/lib/types.ts`)

shop, staff, products, variants, customers, salesmen, suppliers, bills, bill_lines, bill_payments, offers, vouchers,
alterations, purchases, purchase_lines, stock_counts, expenses, credit_payments, audit_log.
Money stored as integer paise in the DB (floats in the prototype, rounded to 2 dp). Quantity is numeric(10,2) for metres.
Unique: customers.mobile, variants.barcode, vouchers.code, bills.no per shop.

## GST rule

Per line, price per unit after discount: garment <= 2500 -> 5%, above -> 18%; fabric -> 5%; other -> configured rate.
Prices are tax-inclusive (MRP); tax is back-calculated and split CGST/SGST equally (intra-state).

## Build order

1. Shell + seed data + billing slice (S03 -> S04) ✔
2. Products, labels, purchases, stock count
3. Customers, credit, loyalty, alterations, returns/vouchers, offers, salesmen
4. Expenses, reports, settings, staff/PIN, audit log
5. Next session: real backend + multi-device sync
