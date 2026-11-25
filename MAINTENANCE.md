# Keeping Narayana CRM safe and working

No software can promise it will never have a problem. These steps keep the risk low and make every problem recoverable.

## Already in place
- **Every change is checked before it goes live.** GitHub runs type checks, a security audit of the packages the shop uses,
  44 rule/server/security tests (including real MongoDB, both standalone and replica set), a click-through of every screen,
  and a two-counter test where one counter loses the network. A red check means do not merge.
- **Dependabot** opens a pull request every week when a package has an update or a security fix. Major upgrades are held back
  on purpose, because they need a person to test billing and printing.
- **Bills cannot be lost or doubled.** Each bill is saved on the counter first and sent with its own id; the server accepts each
  id once. If the server is off, counters keep billing and catch up later.
- **The server trusts nothing from a counter**: it re-checks permissions, recalculates prices and GST, and validates every field.
- **No PIN is stored in plain text.** Sessions expire (16 hours by default) and are cut off when a person is deactivated.
- **Security headers** on every response (Content-Security-Policy, no framing, nosniff, no-referrer, HSTS on https),
  request size limits, timeouts, rate limits, and same-origin checks on every change.
- **No secrets in the code.** `MONGODB_URI` and `OWNER_PIN` live only in Render / the shop PC's settings; `.env` is git-ignored.
- **Pinned versions.** Node 22 (`.nvmrc`), a lockfile, and a small built-in Excel writer instead of a large library with open
  security issues.
- **Backups** every 24 hours inside the database (30 kept), plus one automatically before every restore. With `BACKUP_COPY_DIR`
  set, every backup is also written as a file to a second place (pen drive or Google Drive folder), so one broken disk cannot
  lose the shop's data. `/api/health` and the Backup & export screen warn when a backup is late or that copy fails.

## What the owner needs to do
| How often | What |
|---|---|
| Daily | Glance at the header on each counter: it should say **Central database · saved**. "changes waiting" means that counter is offline. |
| Weekly | Open Backup & export and check there is no red warning under **Where your data is kept**. If `BACKUP_COPY_DIR` is not set, download the full central copy and keep it in Google Drive or on a pen drive. |
| Weekly | Merge Dependabot pull requests that show green checks. Close red ones and ask a developer. |
| When someone leaves | Settings → Staff & PINs: untick **Can log in** for them. Their sessions end at once. |
| Every 6 months | Change the MongoDB Atlas database password, then update `MONGODB_URI` in Render. Turn on two-factor login for Atlas, GitHub and Render. |
| Every 6 months | Test a restore: on a spare PC, start the server with a new `DATA_DIR`, log in as owner, restore last week's copy, check a few bills. |
| Yearly | Upgrade major versions (React, Vite, MongoDB driver) with a developer, run all checks, test a printed bill, then merge. |

## Rules for developers (so the software keeps working)
1. A new feature that changes data = a new operation in `src/lib/ops.ts` with a zod schema in `src/lib/schemas.ts` and a test.
   Never write to the data from a screen directly.
2. Never rename or remove a field that is already saved. Add the new field, and fill it for old data in `src/lib/migrate.ts`
   (bump the version number there). Migrations must be safe to run twice; there is a test for that.
3. Operations must be deterministic: ids and times come in with the operation, never `Math.random()` or `new Date()` inside `run`.
4. Keep exactly one server instance (`numInstances: 1`). The server applies changes one at a time from memory.
5. Run `npm run check`, `npm run test:e2e` and `npm run test:sync` before opening a pull request.

## If something breaks
- **A counter says "Server unreachable"**: billing continues. Check the server PC is on and on the same network, then open
  `http://<server>:4545/api/health`. It should say `"ok":true`.
- **The cloud site is down**: check the Render dashboard for a failed deploy and click **Rollback** on the last good one.
- **"The central database refused a change"** on a counter: the message says why (for example a permission or a deleted item).
  The change was not saved; redo it the right way.
- **Wrong data after a mistake**: Backup & export → Server backups → download the backup from before the mistake → restore it.
  The server saves a backup of the current data first, so a restore can itself be undone.
- **Server will not start**: the first line printed says why (for example a bad setting or `OWNER_PIN` missing on a new database).
