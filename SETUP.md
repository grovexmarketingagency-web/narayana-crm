# Setting up Narayana Textiles CRM in the shop

## Option A: one billing counter (simplest)

1. Copy `narayana-textiles-crm.html` to the counter PC and open it in Chrome or Edge.
2. Data is saved on that computer. Go to **Backup & export → Scheduled automatic backup**, set "Once a day" and
   **Choose backup folder** (a Google Drive / OneDrive / pen-drive folder) so a copy leaves the PC every day.

## Option B: central database for several counters (recommended)

The main PC (or a small always-on PC) runs the central database. Every counter opens the app from it, so stock,
bills, purchases, accounts and suppliers are the same everywhere.

1. Install Node.js 22 LTS (22.12 or newer) on the main PC.
2. Copy this project folder there, then in a terminal:
   ```
   npm ci
   npm run build
   set OWNER_PIN=4826            (Windows; on Mac/Linux: export OWNER_PIN=4826)
   npm run server
   ```
   `OWNER_PIN` is only used the first time, to create the owner's login. Pick your own 4 to 8 digits and change it later
   in Settings. (To try it with demo data instead, use `SEED_DEMO=1`.) All settings are listed in `.env.example`.
3. The terminal prints the address, e.g. `http://192.168.1.20:4545`. Open it in Chrome on every counter
   (bookmark it). Each person logs in with their own PIN. The header shows **Central database · saved** when connected.
4. Data is kept in `server/data/narayana.sqlite`. The server takes a backup inside the database every 24 hours (keeps 30),
   and the owner can download any of them, or a full copy, from **Backup & export**. Keep a copy off the PC as well:
   set `BACKUP_COPY_DIR` to a Google Drive / OneDrive synced folder or a pen drive (for example
   `set BACKUP_COPY_DIR=D:\NarayanaBackups`), and every backup is also saved there as a file. If the PC's disk dies,
   install the server on another PC and restore the newest file from that folder. **Backup & export** shows a red
   warning when a backup is late or the copy folder cannot be written.
5. If a counter loses the network, or the server PC is switched off, the counter keeps billing. Each bill is saved on the
   counter first and sent when the server is back, even if the browser was closed in between. The server accepts every
   change exactly once, so a bill is never lost and never doubled.
6. Run the server at start-up: Windows Task Scheduler → "At log on" → `npm run server` in this folder.

## Option C: in the cloud (MongoDB Atlas + Render)

1. Create a free MongoDB Atlas cluster, a database user, and copy the connection string.
2. In Render: New → Blueprint → pick this repository (it reads `render.yaml`).
3. Enter `MONGODB_URI` and `OWNER_PIN` when Render asks. Deploy. Open the Render address on every counter.
4. Keep one instance only (it is set that way). See MAINTENANCE.md for passwords and updates.

## Hardware

- **Barcode scanner gun** (USB/Bluetooth, "keyboard mode"): click the scan box on Billing and scan. Labels print as
  Code 128 barcodes, which every scanner gun reads. Switch to QR in Settings if you use phone/2D scanners.
- **Thermal printer** (58 mm or 80 mm): install its Windows driver, set the paper width in Settings → Shop & bill,
  and pick it in the print dialog once ("remember" it). For no print dialog at all, start Chrome with `--kiosk-printing`.
- **Label printer** (50 × 25 mm rolls) or A4 sticker sheets (3 × 8).

## First day checklist

- Settings → Shop & bill: shop name, address, phone, GSTIN, bill footer.
- Settings → GST, loyalty & opening balances: confirm GST rates with the accountant; enter opening cash and bank.
- Settings → Staff & PINs: add each person with their own PIN (change every demo PIN if you started with demo data);
  Settings → Role permissions: choose screens per role. The server enforces these, not just the screens.
- Products → Import template → fill in Excel → Import CSV (or add products one by one; SKU and barcode are automatic).
- Barcode labels → "One per piece in stock" → print.
- Backup & export → Reset is in Settings → Backup tab if you want to clear demo data first.
