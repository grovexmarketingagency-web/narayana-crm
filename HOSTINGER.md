# Running Narayana CRM on Hostinger

Narayana CRM has a server (the central database), so it needs a host that can run Node.js. Plain shared hosting
(only PHP and files) cannot run it.

## Which Hostinger plan
- **VPS (KVM 1 or bigger): recommended.** You control it fully, and the data can stay on the VPS disk or in MongoDB Atlas.
- **Business / Cloud web hosting with "Node.js apps":** works too, but use MongoDB Atlas for the data, because the app's
  own folder can be replaced when you update it.
- **Single / Premium shared hosting: will not work.** Use Render (see SETUP.md, option C) or the shop PC (option B) instead.

## Where the data lives
| Setup | Main copy | Second copy |
|---|---|---|
| VPS without Atlas | `DATA_DIR` on the VPS disk (default `server/data/narayana.sqlite`) | `BACKUP_COPY_DIR`, plus Hostinger's weekly VPS backups (turn them on in hPanel) |
| VPS or Node.js app with Atlas | MongoDB Atlas (Mumbai region), which keeps its own copies | Backups inside Atlas, plus the owner's weekly download |

## Steps on a VPS (Ubuntu)
1. In hPanel → VPS, choose Ubuntu 24.04 and note the IP address. Log in with SSH.
2. Install Node.js 22, then get the code:
   ```
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs git
   git clone https://github.com/grovexmarketingagency-web/narayana-crm.git && cd narayana-crm
   npm ci && npm run build
   ```
3. Create `.env` from `.env.example`. Set at least `OWNER_PIN` (first start only), `NODE_ENV=production`,
   `TRUST_PROXY=1`, `DATA_DIR=/var/lib/narayana` and `BACKUP_COPY_DIR=/var/backups/narayana`. Add `MONGODB_URI` to use Atlas.
4. Keep it running and restart it after a reboot with pm2:
   ```
   sudo npm i -g pm2
   pm2 start "node --env-file=.env --no-warnings server/dist/index.mjs" --name narayana
   pm2 save && pm2 startup
   ```
5. Put it behind https with your domain. In hPanel → DNS, point `crm.your-domain.in` to the VPS IP, then:
   ```
   sudo apt install -y caddy
   echo "crm.your-domain.in { reverse_proxy localhost:4545 }" | sudo tee /etc/caddy/Caddyfile && sudo systemctl reload caddy
   ```
   Caddy gets and renews the SSL certificate on its own.
6. Check it: open `https://crm.your-domain.in/api/health`. It should say `"ok":true` and `"backupCopy":"ok"`.
   Then open the site on each counter and log in as the owner.
7. In hPanel, turn on the VPS firewall and allow only ports 22, 80 and 443. Turn on weekly VPS backups.

## Updating later
```
cd narayana-crm && git pull && npm ci && npm run build && pm2 restart narayana
```
The data is not touched by an update. Each counter picks up the new version the next time it loads.

## If something breaks
- **The site does not open:** run `pm2 logs narayana`. The first lines say why, for example a bad setting.
- **Data looks wrong after a mistake:** Backup & export → Server backups → restore the backup from before the mistake.
- **The VPS is lost:** on a new VPS, repeat the steps, then log in as owner and restore the newest file from the
  `BACKUP_COPY_DIR` copy (or Atlas, if you use it).
