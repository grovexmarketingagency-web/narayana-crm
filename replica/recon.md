# Recon map: TizoPOS (web + Windows/Android counter app)

Scope: the shop-counter retail system for a textile store. Billing/POS, products and stock, customers and loyalty, credit, alterations, returns and vouchers, offers, salesman commission, purchases, expenses, reports, staff control.
For: Narayana Textiles (a textile/saree/garment retailer), built as their own branded CRM + POS.
Date: 2026-11-06

Clean-room note: everything below was taken from TizoPOS's public marketing pages only. No account, no app code, no network calls, no assets. The clone uses original Narayana Textiles branding and copy.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | marketing home | https://tizopos.com/ | 12 feature blocks, 3-step setup, hardware, industries, plans (Starter/Growth/Pro) |
| 2 | textile shops page | https://tizopos.com/textile-billing-software/ | metre billing, hold bill, multi-tab, GST slab rule, dead stock, stock count, accountant login, Tally export |
| 3 | feature pages (linked) | /barcode-billing-software/, /offline-billing-software/, /gst-billing-software/, /salesman-commission-software/, /offers-coupons-billing-software/, /customer-loyalty-software/, /credit-sales-software/, /alteration-tracking-software/, /inventory-stock-software/, /returns-exchange-billing-software/, /sales-reports-profit-software/, /staff-control-billing-software/ | summarised on the home page |
| 4 | free tools | /gst-calculator-for-clothes/, /qr-label-maker/, /hsn-code-finder-textiles/, /price-margin-calculator/ | hints for helper tools |
| 5 | user's own account | none | not used |

## Core loop

Scan a tagged item at the counter, add the salesman and customer, take payment, print or WhatsApp a GST bill, and have stock, loyalty, commission and reports update by themselves.

## Screens

| ID | screen | route | purpose | key components | states |
| --- | --- | --- | --- | --- | --- |
| S01 | Staff login | /login | pick staff, enter PIN | PIN pad, user tiles | wrong PIN |
| S02 | Dashboard | / | today's sales, bills, profit, best sellers, low stock, dues, alterations due | stat tiles, bar chart, lists | empty day, filled |
| S03 | Billing counter | /billing | scan/search items, metre qty, multi-tab + hold, salesman, customer, offers, coupon, voucher, split payment, credit | search box (scanner wedge), cart table, tabs, payment modal | empty cart, held bills, offline |
| S04 | Bill print | /bills/:id | thermal 80 mm GST bill with HSN, CGST/SGST | receipt | reprint |
| S05 | Bills history | /bills | search, filter by date/payment | table | empty, filtered |
| S06 | Products & stock | /products | variants by size/colour, stock, low-stock flag, unit pcs or metre | table, filters | empty, low stock |
| S07 | Product editor | /products (modal) | add/edit product + variants, HSN, GST type, cost, MRP | form, variant grid | validation |
| S08 | QR labels | /labels | pick variants and copies, print 50x25 mm or A4 sheet | label grid with QR | none selected |
| S09 | Purchases | /purchases | supplier inward with cost price, adds stock | form, table | empty |
| S10 | Stock count | /stock-count | scan shelves, see missing/extra, apply correction | scan box, diff table | no count running |
| S11 | Customers | /customers | by mobile, loyalty, history, dues | table, detail drawer | empty, new |
| S12 | Credit / dues | /credit | balances, limits, collect partial payments | table, collect modal | no dues |
| S13 | Alterations | /alterations | slip with due date and charge, status, ready-for-pickup | board/table, slip print | overdue |
| S14 | Returns & vouchers | /returns | return items from a bill, refund or credit note, gift vouchers part-redeemable | bill lookup, voucher list | invalid bill |
| S15 | Offers & coupons | /offers | % off, buy X get Y, flat off above amount, coupon codes | list, form | inactive, expired |
| S16 | Salesmen | /salesmen | code cards, points/commission per piece, leaderboard | table, card print | none |
| S17 | Expenses | /expenses | daily shop expenses by category | form, table | empty |
| S18 | Reports | /reports | sales, best sellers, sizes, busy hours, dead stock 30/60/90/180, GST summary (GSTR-1 style), profit, Excel/CSV export | tabs, charts, tables | no data in range |
| S19 | Settings & staff | /settings | shop details, GST rules, bill footer, staff with roles + PIN, discount PIN limit, change log, backup/export | forms, table | non-owner denied |
| S20 | Suppliers | /suppliers | supplier book with GSTIN | table | empty |

## Flows

```
F01 Counter sale (core loop)
    S03 scan/search -> add (metre qty for cloth) -> salesman -> customer by mobile -> Pay -> S04 print
    happy path clicks: ~5 plus scans
    edge: item out of stock, discount above staff limit needs owner PIN, offline, two customers at once (tabs), hold bill
F02 Sale on credit: S03 -> Pay -> "Credit" with customer -> S12 shows due; later collect part payment
    edge: credit limit exceeded, no customer chosen
F03 Add products and print stickers: S06 -> S07 add variants -> S08 print QR labels
F04 Receive stock: S09 supplier, items, cost -> stock goes up, cost used for profit
F05 Stock count: S10 start -> scan -> review missing/extra -> apply
F06 Alteration: S13 new slip (customer, item, work, charge, due) -> mark ready -> delivered
F07 Return/exchange: S14 find bill -> pick items -> refund or credit note -> redeem note/voucher in S03
F08 Run an offer: S15 create -> auto-applies at S03 / coupon code entered at S03
F09 Owner checks the day: S02 -> S18 reports -> export
F10 Staff control: S19 add staff + role + PIN -> S01 login -> restricted screens hidden; change log written
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, danger | default, hover, focus, disabled | all |
| Input / Select | text, number, search, date | focus, error, disabled | all |
| Modal | form, confirm, PIN | open/close, Esc | S03, S07, S12-S16 |
| Data table | sortable, empty row | empty, filled | S05-S20 |
| Stat tile | value + delta | | S02, S18 |
| Bar chart | vertical | empty | S02, S18 |
| Tabs | page tabs, bill tabs | active | S03, S18 |
| Badge | success, warning, danger, neutral | | all |
| Toast | success, error | | all |
| PIN pad | | wrong | S01, S03 |
| Receipt | 80 mm | | S04, S13 |
| QR label | 50x25 mm | | S08, S16 |
| Sidebar nav | collapsed on mobile | active, role hidden | shell |

## Inferred data model

```
Shop        name, address, phone, gstin, state, bill_footer, gst rules (garment 5%/18% at 2500 threshold, fabric 5%)  confidence: high
Staff       name, role (owner|manager|cashier|accountant), pin, max_discount_pct   evidence: staff control, accountant login  high
Product     name, category, hsn, gst_type (garment|fabric|other), unit (pcs|m), brand   high
Variant     product_id, size, colour, sku/barcode, mrp, cost, stock, low_stock_at        high (each size/colour own stock and sticker)
Customer    mobile (unique), name, points, credit_limit, balance, birthday               high
Salesman    code, name, points_per_piece or commission_pct                              high
Bill        no, date, staff, customer, salesman, lines, subtotal, discount, tax lines, total, payments [{mode, amount}], status (paid|credit|partial|returned)  high
BillLine    variant, qty (decimal for metres), rate, discount, gst_rate, salesman      high
Offer       type (percent|bxgy|flat_above), value, scope (all|category), coupon_code, active dates  high
Voucher     code, kind (gift|credit_note), amount, balance, customer                     high
Alteration  customer, bill, item, work, charge, due_date, status (pending|ready|delivered)  high
Purchase    supplier, invoice_no, date, lines (variant, qty, cost)                       high
StockCount  started_at, scanned {variant: qty}, status                                  medium
Expense     date, category, amount, note                                                high
Payment     customer, amount, mode, date (credit collections)                            high
AuditLog    at, staff, action, detail                                                    high (change history)
```

## Feature matrix

See `features.csv`. Must 24, should 12, could 7, skip 4.

## Out of scope (cannot or should not be cloned)

- TizoPOS name, logo, copy, screenshots and pricing: replaced with Narayana Textiles branding.
- Hardware bundles and installer network (TVS/Epson/TSC printers are supported through the browser print dialog only).
- Native desktop/Android apps: the clone is a browser app, installable later as a PWA.
- Tally direct integration: CSV/Excel export only for now.

## Size

Screens 20, flows 10, entities 15. Hard parts: offline billing with sync, GST slab rules after discount, accurate stock across bills/returns/purchases/counts. Size: M (a few weeks to production-ready; first build here is a working front-end prototype on local data).
