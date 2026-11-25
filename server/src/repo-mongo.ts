/* MongoDB storage (MongoDB Atlas, or a local MongoDB on the shop PC).
   Collections: head (one document), records, oplog (auto-expires), sessions (auto-expire), backups.
   Commits use a transaction when the server supports one (Atlas, any replica set). A standalone MongoDB has no
   transactions, so records are written first and the head last: after a crash the server rebuilds the version
   from the records themselves, so nothing saved is ever ignored. */
import { MongoClient, Binary, type Db, type ClientSession, type AnyBulkWriteOperation } from 'mongodb'
import type { Change } from '../../src/lib/sync'
import { OPLOG_DAYS, type BackupRow, type Commit, type Head, type OpRow, type Repo, type SessionRow } from './repo'

type RecDoc = { _id: string; c: string; i: string; v: number; s: number; d: unknown }
type HeadDoc = Head & { _id: 'head' }
type OpDoc = Omit<OpRow, 'id'> & { _id: string; saved: Date }
type SessDoc = { _id: string; staffId: string; exp: Date }
type BackupDoc = BackupRow & { _id: string; gz: Binary }

const noTransactions = (e: unknown) => {
  const err = e as { code?: number; message?: string }
  return err.code === 20 || /replica set|Transaction numbers|transactions are not supported/i.test(err.message || '')
}

export class MongoRepo implements Repo {
  readonly kind = 'mongodb' as const
  readonly shared = false
  private client: MongoClient
  private db!: Db
  private txOk = true
  constructor(uri: string, private dbName: string) {
    this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, retryWrites: true, appName: 'narayana-crm', ignoreUndefined: true })
  }
  private get c() {
    return {
      head: this.db.collection<HeadDoc>('head'), records: this.db.collection<RecDoc>('records'), oplog: this.db.collection<OpDoc>('oplog'),
      sessions: this.db.collection<SessDoc>('sessions'), backups: this.db.collection<BackupDoc>('backups'),
    }
  }
  async init() {
    await this.client.connect()
    this.db = this.client.db(this.dbName)
    const c = this.c
    await Promise.all([
      c.records.createIndex({ v: 1 }),
      c.oplog.createIndex({ saved: 1 }, { expireAfterSeconds: OPLOG_DAYS * 86400 }),
      c.sessions.createIndex({ exp: 1 }, { expireAfterSeconds: 0 }),
      c.sessions.createIndex({ staffId: 1 }),
      c.backups.createIndex({ at: -1 }),
    ])
  }
  async head(): Promise<Head | null> {
    const h = await this.c.head.findOne({ _id: 'head' })
    return h ? { version: h.version, seq: h.seq, resetAt: h.resetAt, secret: h.secret, serverId: h.serverId } : null
  }
  async createHead(h: Head) { await this.c.head.insertOne({ _id: 'head', ...h }) }
  async records(): Promise<Change[]> {
    const out: Change[] = []
    for await (const r of this.c.records.find({}, { batchSize: 2000 })) out.push({ c: r.c, i: r.i, v: r.v, s: r.s, d: r.d })
    return out
  }
  async recordsSince(v: number): Promise<Change[]> {
    return (await this.c.records.find({ v: { $gt: v } }).toArray()).map(r => ({ c: r.c, i: r.i, v: r.v, s: r.s, d: r.d }))
  }
  locked<T>(fn: () => Promise<T>): Promise<T> { return fn() }
  private async write(c: Commit, session: ClientSession | undefined, replace: boolean) {
    const col = this.c
    if (replace) await col.records.deleteMany({}, { session })
    const ops: AnyBulkWriteOperation<RecDoc>[] = c.records.map(r => ({ replaceOne: { filter: { _id: r.c + '/' + r.i }, replacement: { _id: r.c + '/' + r.i, c: r.c, i: r.i, v: r.v, s: r.s, d: r.d }, upsert: true } }))
    for (let i = 0; i < ops.length; i += 1000) await col.records.bulkWrite(ops.slice(i, i + 1000), { session, ordered: true })
    if (c.ops.length) {
      const saved = new Date()
      await col.oplog.bulkWrite(c.ops.map(o => ({ updateOne: { filter: { _id: o.id }, update: { $setOnInsert: { v: o.v, ok: o.ok, error: o.error, staffId: o.staffId, name: o.name, at: o.at, saved } }, upsert: true } })), { session })
    }
    await col.head.updateOne({ _id: 'head' }, { $set: { version: c.head.version, seq: c.head.seq, resetAt: c.head.resetAt } }, { session })
  }
  private async atomic(c: Commit, replace: boolean) {
    if (this.txOk) {
      const s = this.client.startSession()
      try { await s.withTransaction(() => this.write(c, s, replace)); return }
      catch (e) { if (!noTransactions(e)) throw e; this.txOk = false; console.warn('MongoDB has no transactions (standalone server); using ordered writes instead') }
      finally { await s.endSession() }
    }
    await this.write(c, undefined, replace)
  }
  async commit(c: Commit) { await this.atomic(c, false) }
  async replaceAll(c: Commit) { await this.atomic(c, true) }
  async findOp(id: string): Promise<OpRow | null> {
    const o = await this.c.oplog.findOne({ _id: id })
    return o ? { id: o._id, v: o.v, ok: o.ok, error: o.error ?? undefined, staffId: o.staffId, name: o.name, at: o.at } : null
  }
  async putSession(s: SessionRow) { await this.c.sessions.replaceOne({ _id: s.id }, { staffId: s.staffId, exp: new Date(s.exp) }, { upsert: true }) }
  async getSession(id: string): Promise<SessionRow | null> { const s = await this.c.sessions.findOne({ _id: id }); return s ? { id: s._id, staffId: s.staffId, exp: s.exp.getTime() } : null }
  async deleteSession(id: string) { await this.c.sessions.deleteOne({ _id: id }) }
  async deleteSessionsFor(staffId: string) { await this.c.sessions.deleteMany({ staffId }) }
  async putBackup(b: BackupRow, gz: Buffer, keep: number) {
    if (gz.length > 15.5e6) throw new Error('Backup is larger than MongoDB allows in one document; download it from /api/export instead')
    await this.c.backups.replaceOne({ _id: b.name }, { ...b, gz: new Binary(gz) }, { upsert: true })
    const old = await this.c.backups.find({}, { projection: { _id: 1 } }).sort({ at: -1 }).skip(keep).toArray()
    if (old.length) await this.c.backups.deleteMany({ _id: { $in: old.map(o => o._id) } })
  }
  async listBackups(): Promise<BackupRow[]> {
    return (await this.c.backups.find({}, { projection: { gz: 0 } }).sort({ at: -1 }).toArray()).map(b => ({ name: b.name, at: b.at, v: b.v, size: b.size, reason: b.reason }))
  }
  async getBackup(name: string) { const b = await this.c.backups.findOne({ _id: name }); return b ? Buffer.from(b.gz.buffer) : null }
  async purge() { /* MongoDB removes expired sessions and old operation ids itself (TTL indexes) */ }
  async ping() { try { await this.db.command({ ping: 1 }); return true } catch { return false } }
  async close() { await this.client.close() }
}
