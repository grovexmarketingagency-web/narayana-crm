/* SQLite storage: one file (narayana.sqlite) on the shop PC. Uses Node's built-in sqlite, so nothing to install.
   WAL mode plus a transaction per commit keeps the file consistent through power cuts. */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { DatabaseSync as DatabaseSyncT } from 'node:sqlite'
// loaded with require so test tools that do not know node:sqlite yet can still load this file
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
import type { Change } from '../../src/lib/sync'
import { OPLOG_DAYS, type BackupRow, type Commit, type Head, type OpRow, type Repo, type SessionRow } from './repo'

type Row = Record<string, unknown>

export class SqliteRepo implements Repo {
  readonly kind = 'sqlite' as const
  private db: DatabaseSyncT
  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
  }
  async init() {
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS head (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, seq INTEGER NOT NULL, reset_at INTEGER NOT NULL, secret TEXT NOT NULL, server_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records (k TEXT PRIMARY KEY, c TEXT NOT NULL, i TEXT NOT NULL, v INTEGER NOT NULL, s INTEGER NOT NULL, d TEXT);
      CREATE INDEX IF NOT EXISTS records_v ON records (v);
      CREATE TABLE IF NOT EXISTS oplog (id TEXT PRIMARY KEY, v INTEGER NOT NULL, ok INTEGER NOT NULL, error TEXT, staff_id TEXT NOT NULL, name TEXT NOT NULL, at TEXT NOT NULL, saved INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS oplog_saved ON oplog (saved);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, exp INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS backups (name TEXT PRIMARY KEY, at TEXT NOT NULL, v INTEGER NOT NULL, size INTEGER NOT NULL, reason TEXT NOT NULL, gz BLOB NOT NULL);`)
  }
  private tx(fn: () => void) {
    this.db.exec('BEGIN IMMEDIATE')
    try { fn(); this.db.exec('COMMIT') } catch (e) { this.db.exec('ROLLBACK'); throw e }
  }
  async head(): Promise<Head | null> {
    const r = this.db.prepare('SELECT * FROM head WHERE id = 1').get() as Row | undefined
    return r ? { version: Number(r.version), seq: Number(r.seq), resetAt: Number(r.reset_at), secret: String(r.secret), serverId: String(r.server_id) } : null
  }
  async createHead(h: Head) {
    this.db.prepare('INSERT INTO head (id, version, seq, reset_at, secret, server_id) VALUES (1, ?, ?, ?, ?, ?)').run(h.version, h.seq, h.resetAt, h.secret, h.serverId)
  }
  async records(): Promise<Change[]> {
    return (this.db.prepare('SELECT c, i, v, s, d FROM records').all() as Row[]).map(r => ({ c: String(r.c), i: String(r.i), v: Number(r.v), s: Number(r.s), d: r.d === null ? null : JSON.parse(String(r.d)) }))
  }
  private write(c: Commit) {
    const up = this.db.prepare('INSERT INTO records (k, c, i, v, s, d) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, s = excluded.s, d = excluded.d')
    for (const r of c.records) up.run(r.c + '/' + r.i, r.c, r.i, r.v, r.s, r.d === null ? null : JSON.stringify(r.d))
    const op = this.db.prepare('INSERT OR IGNORE INTO oplog (id, v, ok, error, staff_id, name, at, saved) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    for (const o of c.ops) op.run(o.id, o.v, o.ok ? 1 : 0, o.error ?? null, o.staffId, o.name, o.at, Date.now())
    this.db.prepare('UPDATE head SET version = ?, seq = ?, reset_at = ? WHERE id = 1').run(c.head.version, c.head.seq, c.head.resetAt)
  }
  async commit(c: Commit) { this.tx(() => this.write(c)) }
  async replaceAll(c: Commit) { this.tx(() => { this.db.exec('DELETE FROM records'); this.write(c) }) }
  async findOp(id: string): Promise<OpRow | null> {
    const r = this.db.prepare('SELECT * FROM oplog WHERE id = ?').get(id) as Row | undefined
    return r ? { id: String(r.id), v: Number(r.v), ok: !!r.ok, error: r.error ? String(r.error) : undefined, staffId: String(r.staff_id), name: String(r.name), at: String(r.at) } : null
  }
  async putSession(s: SessionRow) { this.db.prepare('INSERT OR REPLACE INTO sessions (id, staff_id, exp) VALUES (?, ?, ?)').run(s.id, s.staffId, s.exp) }
  async getSession(id: string): Promise<SessionRow | null> {
    const r = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Row | undefined
    return r ? { id: String(r.id), staffId: String(r.staff_id), exp: Number(r.exp) } : null
  }
  async deleteSession(id: string) { this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id) }
  async deleteSessionsFor(staffId: string) { this.db.prepare('DELETE FROM sessions WHERE staff_id = ?').run(staffId) }
  async putBackup(b: BackupRow, gz: Buffer, keep: number) {
    this.tx(() => {
      this.db.prepare('INSERT OR REPLACE INTO backups (name, at, v, size, reason, gz) VALUES (?, ?, ?, ?, ?, ?)').run(b.name, b.at, b.v, b.size, b.reason, gz)
      this.db.prepare('DELETE FROM backups WHERE name NOT IN (SELECT name FROM backups ORDER BY at DESC LIMIT ?)').run(keep)
    })
  }
  async listBackups(): Promise<BackupRow[]> {
    return (this.db.prepare('SELECT name, at, v, size, reason FROM backups ORDER BY at DESC').all() as Row[]).map(r => ({ name: String(r.name), at: String(r.at), v: Number(r.v), size: Number(r.size), reason: String(r.reason) }))
  }
  async getBackup(name: string) { const r = this.db.prepare('SELECT gz FROM backups WHERE name = ?').get(name) as Row | undefined; return r ? Buffer.from(r.gz as Uint8Array) : null }
  async purge(now: number) {
    this.db.prepare('DELETE FROM sessions WHERE exp < ?').run(now)
    this.db.prepare('DELETE FROM oplog WHERE saved < ?').run(now - OPLOG_DAYS * 86400e3)
  }
  /** data saved by the first version of the server (one JSON document), if this file has it */
  legacyData(): unknown | null {
    try { const r = this.db.prepare("SELECT data FROM store WHERE id = 1").get() as Row | undefined; return r ? JSON.parse(String(r.data)) : null } catch { return null }
  }
  async ping() { try { this.db.prepare('SELECT 1').get(); return true } catch { return false } }
  async close() { this.db.close() }
}
