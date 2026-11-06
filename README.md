# Narayana Textiles CRM + POS

Counter billing and customer manager for Narayana Textiles: GST billing with barcode labels, metre cloth, salesmen, offers,
loyalty, credit, alterations, returns and vouchers, stock and purchases, accounts, reports, Excel/PDF exports and backups.

## Run

```bash
npm ci
npm run dev                          # app only, http://localhost:5173 (data stays in the browser)
npm run build                        # app + central database server
SEED_DEMO=1 npm run server           # central database on http://<pc-ip>:4545 with demo data (see SETUP.md)
npm run build:single                 # one self-contained dist-single/index.html (single counter, works offline)

npm run check                        # type checks + 44 rule, server, security and MongoDB tests
npm run test:e2e                     # 37-check click-through of every screen (after build:single)
npm run test:sync                    # two counters + an offline counter on one central database (after build)
```

Demo PINs (demo data only): Owner 1234, Manager 2222, Cashier 1111, Accountant 0000.

## How data stays safe

- Every change is an **operation** with its own id (`src/lib/ops.ts`). The same code runs on the counter (so billing works
  offline) and on the server (so the server's copy is the official one).
- The counter saves each operation to IndexedDB the moment it happens (`src/lib/store.ts`, `src/lib/persist.ts`), then sends it.
  The server applies each id **exactly once**, so retries after a dropped connection never double a bill.
- The server **re-checks everything**: input shape (`src/lib/schemas.ts`, zod), the person's role and screen permissions, prices,
  offers and GST (recalculated, never trusted from the counter), payment totals, and owner approval for big discounts
  (signed per bill).
- Staff log in with PINs stored as **scrypt hashes**; sessions are random tokens in httpOnly SameSite=Strict cookies.
  Wrong PINs are rate limited and lock a person for 5 minutes after 6 tries.
- Storage is MongoDB (`MONGODB_URI`, transactions when available) or a SQLite file on the shop PC. Each batch of changes is one
  atomic write; only changed records are saved and sent to counters (`src/lib/sync.ts`).
- Scheduled backups inside the database, owner-only download and restore (checked before anything is replaced; a backup is
  taken first).

## Where things are

- `src/lib/ops.ts` every change the app can make, with its rules and permissions. **Add new features here first.**
- `src/lib/schemas.ts` the allowed shape of every change. `src/lib/migrate.ts` upgrades older data (runs on every start).
- `src/lib/store.ts` the app's data layer. `src/lib/sync.ts` record-level sync shared by app and server.
- `server/src/` the central database: `app.ts` (HTTP, headers, limits), `engine.ts` (applies changes one at a time),
  `auth.ts` (PINs, sessions, approvals), `repo-mongo.ts` / `repo-sqlite.ts` (storage), `config.ts` (settings, see `.env.example`).
- `src/lib/calc.ts` bill engine: discounts, offers, GST slabs, CGST/SGST. `src/lib/ledger.ts` cash book and ledgers.
- `src/lib/exports.ts` + `src/lib/xlsx.ts` Excel/PDF. `src/lib/backup.ts` scheduled backups on a single counter.
- `src/pages/*` one file per screen. `tests/` automated tests. `e2e/` browser tests. `replica/` planning notes.

See SETUP.md to install in the shop and MAINTENANCE.md to keep it healthy.

```bash
python3 scripts/artifact.py dist-single/index.html preview.html   # page body for the online preview
```
