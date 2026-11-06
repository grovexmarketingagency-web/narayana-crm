/* The central database's working copy. All changes go through here one at a time (no two counters can
   interleave half-finished changes), and each batch is saved to storage before anyone sees it. */
import zlib from 'node:zlib'
import { produce, setAutoFreeze } from 'immer'
import { z } from 'zod'
import type { DB, Staff } from '../../src/lib/types'
import { applyOp, denied, OpError } from '../../src/lib/ops'
import { migrate } from '../../src/lib/migrate'
import { shopS } from '../../src/lib/schemas'
import { diff, fromChanges, LISTS, toChanges, type Change } from '../../src/lib/sync'
import { argsS } from '../../src/lib/schemas'
import { approvalToken, hashPin, newId, newSecret, readApproval } from './auth'
import type { BackupRow, Head, OpRow, Repo } from './repo'

setAutoFreeze(false)

type Info = { c: string; i: string; v: number; s: number; d: unknown }
export interface OpResult { id: string; ok: boolean; error?: string; dup?: boolean; retry?: boolean }

const envelope = z.object({
  id: z.string().min(6).max(64).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().refine(n => n in argsS, 'unknown change type'),
  args: z.unknown(),
  at: z.string().max(40),
})
const DAY = 86400e3

/** no PIN is ever stored in plain text: new PINs are replaced by their hash */
function securePins(d: DB) { for (const s of d.staff) if (s.pin) { s.pinHash = hashPin(s.pin); delete s.pin } }
/** what counters may see of a record (no PIN hashes) */
export function forClient(c: Change): Change {
  if (c.c === 'staff' && c.d) { const { pin: _p, pinHash: _h, ...rest } = c.d as Staff; return { ...c, d: rest } }
  return c
}

export class Engine {
  state!: DB
  head!: Head
  private info = new Map<string, Info>()
  private chain: Promise<unknown> = Promise.resolve()
  constructor(private repo: Repo, private keepBackups = 30) {}

  static async open(repo: Repo, initial: () => DB, keepBackups = 30): Promise<Engine> {
    const e = new Engine(repo, keepBackups)
    await repo.init()
    let head = await repo.head()
    const records = head ? await repo.records() : []
    if (!head || records.length === 0) {
      const db = initial(); migrate(db); securePins(db)
      const changes = toChanges(db, 1)
      if (!head) { head = { version: 0, seq: changes.length + 1, resetAt: 1, secret: newSecret(), serverId: newId() }; await repo.createHead(head) }
      await repo.replaceAll({ head: { version: 1, seq: changes.length + 1, resetAt: 1 }, records: changes, ops: [] })
      e.load({ ...head, version: 1, seq: changes.length + 1, resetAt: 1 }, changes)
    } else e.load(head, records)
    await e.exclusive(async () => {   // bring old data up to the current shape, and hash any plain PINs left from a restore
      const next = produce(e.state, d => { migrate(d); securePins(d) })
      await e.commitNext(next, [])
    })
    return e
  }

  private load(head: Head, records: Change[]) {
    const { db } = fromChanges(records)
    this.state = db; this.info.clear()
    let v = head.version, s = head.seq
    for (const r of records) { this.info.set(r.c + '/' + r.i, { ...r }); if (r.v > v) v = r.v; if (r.s >= s) s = r.s + 1 }   // a crash between writes can leave records newer than the head
    this.head = { ...head, version: v, seq: s }
  }

  /** runs one change batch at a time */
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn)
    this.chain = run.catch(() => undefined)
    return run
  }

  get version() { return this.head.version }
  staff(id: string | undefined) { return this.state.staff.find(s => s.id === id) }
  publicStaff() { return this.state.staff.filter(s => s.active).map(s => ({ id: s.id, name: s.name, role: s.role })) }
  approve(billId: string, ownerId: string) { return approvalToken(this.head.secret, billId, ownerId) }

  /** saves the difference between the current data and `next` (plus operation results) as one new version */
  private async commitNext(next: DB, ops: OpRow[]) {
    const changed = diff(this.state, next)
    if (!changed.length && !ops.length) return
    const v = changed.length ? this.head.version + 1 : this.head.version
    let seq = this.head.seq
    const records: Change[] = changed.map(ch => { const k = ch.c + '/' + ch.i; const old = this.info.get(k); return { c: ch.c, i: ch.i, v, s: old && old.d !== null ? old.s : ch.c === '$meta' ? 0 : seq++, d: ch.d } })
    const head = { version: v, seq, resetAt: this.head.resetAt }
    await this.repo.commit({ head, records, ops: ops.map(o => ({ ...o, v })) })
    // only after it is safely stored:
    this.state = next; this.head = { ...this.head, ...head }
    for (const r of records) this.info.set(r.c + '/' + r.i, r)
    const off = changed.filter(ch => ch.c === 'staff' && ch.d && !(ch.d as Staff).active)
    for (const ch of off) await this.repo.deleteSessionsFor(ch.i)
  }

  /** applies counters' changes; each one is accepted or refused on its own, and a repeat of an id returns the first answer */
  submit(staffId: string, raw: unknown[], now = Date.now()): Promise<OpResult[]> {
    return this.exclusive(async () => {
      let cur = this.state
      const results: OpResult[] = []; const rows: OpRow[] = []; const seen = new Map<string, OpResult>()
      const approve = (billId: string, token: string) => { const o = readApproval(this.head.secret, billId, token); const s = o && cur.staff.find(x => x.id === o); return s && s.active && s.role === 'owner' ? s.id : null }
      for (const r of raw) {
        const p = envelope.safeParse(r)
        if (!p.success) { results.push({ id: String((r as { id?: unknown })?.id ?? ''), ok: false, error: 'Malformed change: ' + p.error.issues[0].message }); continue }
        const op = p.data
        const again = seen.get(op.id) ?? await this.repo.findOp(op.id).then(x => x && { id: x.id, ok: x.ok, error: x.error })
        if (again) { results.push({ ...again, dup: true }); continue }
        // the time a bill was made offline is kept, but not if it is in the future or impossibly old
        const t = Date.parse(op.at); const at = Number.isFinite(t) && t <= now + 5 * 60e3 && t >= now - 90 * DAY ? new Date(t).toISOString() : new Date(now).toISOString()
        let error = denied(cur, cur.staff.find(s => s.id === staffId), op.name) ?? undefined
        if (!error) {
          try { cur = produce(cur, d => { applyOp(d, { id: op.id, name: op.name as never, args: op.args as never, staffId, at }, { approve }); securePins(d) }) }
          catch (e) {
            if (e instanceof OpError) error = e.message
            else { console.error('operation failed', op.name, e); results.push({ id: op.id, ok: false, error: 'Server error, will retry', retry: true }); continue }
          }
        }
        const res = { id: op.id, ok: !error, error }
        seen.set(op.id, res); results.push(res)
        rows.push({ id: op.id, v: 0, ok: !error, error, staffId, name: op.name, at })
      }
      await this.commitNext(cur, rows)
      return results
    })
  }

  /** records changed after `since` (or everything, when the counter is too far behind or the data was restored) */
  changesSince(since: number) {
    const full = !(since >= this.head.resetAt && since <= this.head.version)
    const changes: Change[] = []
    for (const r of this.info.values()) if (full ? r.d !== null : r.v > since) changes.push(forClient(r))
    return { version: this.head.version, resetAt: this.head.resetAt, serverId: this.head.serverId, full, changes }
  }

  audit(staffId: string, action: string, detail: string) {
    return this.exclusive(async () => {
      const next = produce(this.state, d => { d.audit.unshift({ id: newId(), at: new Date().toISOString(), staffId, action, detail }) })
      await this.commitNext(next, [])
    })
  }

  /** full copy of the data including PIN hashes (owner-only download and backups) */
  exportDB(): DB { return { ...this.state, drafts: [] } }

  async backup(reason: string): Promise<BackupRow> {
    const json = JSON.stringify(this.exportDB())
    const gz = zlib.gzipSync(json)
    const at = new Date().toISOString()
    const row = { name: `narayana-backup-${at.slice(0, 19).replace(/[:T]/g, '-')}-v${this.version}.json`, at, v: this.version, size: json.length, reason }
    await this.repo.putBackup(row, gz, this.keepBackups)
    return row
  }
  async readBackup(name: string) { const gz = await this.repo.getBackup(name); return gz && zlib.gunzipSync(gz).toString('utf8') }

  /** replaces all data with a backup. Every counter reloads everything on its next sync. */
  restore(input: unknown, staffId: string) {
    const db = checkBackup(input)
    return this.exclusive(async () => {
      await this.backup('before restore')
      migrate(db); securePins(db)
      if (!db.staff.some(s => s.role === 'owner' && s.active && s.pinHash)) throw new OpError('The backup has no active owner with a PIN')
      db.audit.unshift({ id: newId(), at: new Date().toISOString(), staffId, action: 'restore', detail: 'Restored a full backup on the central database' })
      const v = this.head.version + 1
      const records = toChanges(db, v)
      const head = { version: v, seq: records.length + 1, resetAt: v }
      await this.repo.replaceAll({ head, records, ops: [] })
      this.load({ ...this.head, ...head }, records)
      this.head.resetAt = v
    })
  }
}

/** checks that an uploaded file really is a Narayana backup before anything is replaced */
export function checkBackup(input: unknown): DB {
  if (!input || typeof input !== 'object') throw new OpError('Not a Narayana backup file')
  const raw = structuredClone(input) as Record<string, unknown>
  if (!raw.shop || typeof raw.shop !== 'object' || !Array.isArray(raw.variants) || !Array.isArray(raw.staff)) throw new OpError('Not a Narayana backup file')
  for (const k of LISTS) { if (raw[k] === undefined) raw[k] = []; if (!Array.isArray(raw[k])) throw new OpError(`Backup is damaged (${k})`) ; for (const r of raw[k] as unknown[]) if (!r || typeof (r as { id?: unknown }).id !== 'string') throw new OpError(`Backup is damaged (${k} without id)`) }
  raw.drafts = []; raw.counters ??= {}; raw.version ??= 1
  const db = migrate(raw as unknown as DB)
  const shop = shopS.safeParse(db.shop)
  if (!shop.success) throw new OpError('Backup shop settings are damaged: ' + shop.error.issues[0].path.join('.'))
  return db
}
