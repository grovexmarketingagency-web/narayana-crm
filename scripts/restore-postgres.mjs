/* Puts a backup file back into the cloud database from your own computer (the website cannot take very large uploads).
   Usage:  DATABASE_URL=postgres://... node scripts/restore-postgres.mjs  path/to/backup.json[.gz]
   Everything now in the database is replaced; a copy of it is first saved as a backup inside the database. */
import fs from 'node:fs'
import zlib from 'node:zlib'
import { execFileSync } from 'node:child_process'

const file = process.argv[2]
if (!file || !process.env.DATABASE_URL) { console.error('Usage: DATABASE_URL=... node scripts/restore-postgres.mjs <backup.json or .json.gz>'); process.exit(1) }
let raw = fs.readFileSync(file)
if (raw[0] === 0x1f && raw[1] === 0x8b) raw = zlib.gunzipSync(raw)
const data = JSON.parse(raw.toString('utf8'))
// reuse the server's own code, so the checks are the same as the Restore button's
const out = new URL('../api-tmp-restore.mjs', import.meta.url).pathname
execFileSync('npx', ['esbuild', 'server/src/restore-cli.ts', '--bundle', '--platform=node', '--format=esm', '--external:pg-native', '--banner:js=import{createRequire as __cr}from"module";const require=__cr(import.meta.url);', `--outfile=${out}`, '--log-level=error'], { stdio: 'inherit' })
const { restoreInto } = await import(out)
try { const v = await restoreInto(process.env.DATABASE_URL, data); console.log('Restored. Data version is now', v) } finally { fs.rmSync(out, { force: true }) }
