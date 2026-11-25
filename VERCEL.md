# Hosting on Vercel + Supabase

The app runs as one Vercel function (`api/[...slug].mjs`, built from `server/src/serverless.ts`) with the data in a
Supabase PostgreSQL database. The shop pages are served by Vercel as static files.

## Before you start (costs and limits)
- **Vercel Hobby is for non-commercial use.** A shop's billing system is commercial, so use a Vercel **Pro** (or team) account.
- **Supabase free projects pause after about a week without use and have no automatic backups.** For a real shop use
  Supabase **Pro**, or keep the free project and download a backup (Backup & export) often. The app also keeps its own
  daily backups inside the database, but those die with the project.
- Put both in the Mumbai region (Vercel `bom1`, Supabase `ap-south-1`) so billing stays fast.

## Steps
1. **Supabase**: New project (region Mumbai, save the database password). Project → Connect → copy the **Transaction pooler** address (port 6543). Replace `[YOUR-PASSWORD]`.
2. **Vercel**: Add New → Project → pick this repo (branch `feat/vercel-supabase` until merged). Framework: Other. The build/output settings come from `vercel.json`.
3. **Environment variables** (Project → Settings → Environment Variables):
   | name | value |
   |---|---|
   | `DATABASE_URL` | the Supabase pooler address |
   | `OWNER_PIN` | owner's first PIN, 4–8 digits (used only once; change it in Settings afterwards) |
   | `SHOP_NAME` | Narayana Textiles |
   | `CRON_SECRET` | 16+ random characters (Vercel sends it to the daily backup job) |
   | `NODE_ENV` | `production` |
4. Deploy. Open the address, log in as Owner with `OWNER_PIN`, then Settings → turn on two-step login and add staff PINs.
5. **Check on the preview deploy first** (before pointing the shop at it): log in, make a bill, open the site on a second phone, confirm the bill appears there within a few seconds, and in Backup & export press *Backup now*.

## How it stays safe with many copies
Vercel may run several copies of the server at once. Every save takes a database-wide lock inside one transaction, so two
counters can never save at the same instant or double-save a bill; each copy reads other copies' newest changes before it
answers. Wrong-PIN limits and logins are stored in the database too. The tests in `tests/postgres.test.ts` run this against a real PostgreSQL.

## Limits to know
- One answer is limited to 4.5 MB on Vercel, so big data is sent in pages (done automatically) and downloads are compressed.
- **Restoring a very large backup** cannot be uploaded through the website. From your own computer:
  `DATABASE_URL=... node scripts/restore-postgres.mjs backup.json` (the *Restore* button still works for small files).
- `BACKUP_COPY_DIR` (file copy of backups) does not work on Vercel; download backups from Backup & export instead.
- The server loads the whole database when it wakes. That is instant for years of one shop's bills; if it ever gets slow, ask for data archiving.
- Daily backup runs at 2:00 AM IST through `/api/cron` (Vercel cron). Keep `KEEP_BACKUPS` at 14–30.
- The first Vercel deploy of this packaging was tested locally against PostgreSQL, not yet on Vercel itself. Do step 5 before going live.
