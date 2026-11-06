# Build log

| screen | date | status | notes |
| --- | --- | --- | --- |
| S01 login | 2026-11-06 | done | staff tiles + PIN pad, keyboard entry |
| S02 dashboard | 2026-11-06 | done | today sales/profit/avg bill/dues, 14-day chart, best sellers, low stock, alterations, dues |
| S03 billing | 2026-11-06 | done | scan/search, metre qty, multi-tab + hold, salesman card scan, customer by mobile, line/bill discount, auto offers, coupons, split payments, credit, vouchers, points, owner PIN over discount limit, F2/F9 |
| S04 bill print | 2026-11-06 | done | 80 mm GST invoice with HSN, CGST/SGST by rate, WhatsApp send |
| S05 bills | 2026-11-06 | done | filters + CSV export |
| S06/S07 products | 2026-11-06 | done | size/colour variants with own stock, GST type, per-metre, CSV import + template |
| S08 QR labels | 2026-11-06 | done | 50x25 roll and A4 3x8, one-per-piece |
| S09 purchases | 2026-11-06 | done | updates stock and cost |
| S10 stock count | 2026-11-06 | done | scan, differences, missing value, apply/cancel |
| S11 customers | 2026-11-06 | done | history, points, birthdays, export |
| S12 credit | 2026-11-06 | done | limits, part payments, WhatsApp reminder |
| S13 alterations | 2026-11-06 | done | slips, tailor, due/late, ready → WhatsApp → delivered, printable slip |
| S14 returns | 2026-11-06 | done | partial returns, credit notes, cash refund, gift vouchers |
| S15 offers | 2026-11-06 | done | percent / BxGy / flat-above, coupon or automatic, dates |
| S16 salesmen | 2026-11-06 | done | leaderboard, points + commission, QR code cards |
| S17 expenses | 2026-11-06 | done | |
| S18 reports | 2026-11-06 | done | daily, best sellers/categories/sizes, busy hours, dead stock + clearance, GST by rate + HSN, profit |
| S19 settings | 2026-11-06 | done | shop, GST rules, loyalty, staff/roles/PINs, change history, backup/restore |
| S20 suppliers | 2026-11-06 | done | |

Harder than expected: GST slab must be decided per line after the bill-level and offer discounts are spread, so the engine distributes discounts first (src/lib/calc.ts).
