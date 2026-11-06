/* Where the central database keeps its data. Two implementations share this interface:
   MongoDB (MONGODB_URI set, for Atlas or a local MongoDB) and SQLite (a single file on the shop PC, no install).
   Every write is one atomic commit, so a power cut can never leave half a bill saved. */
import type { Change } from '../../src/lib/sync'

export interface Head { version: number; seq: number; resetAt: number; secret: string; serverId: string }
export interface OpRow { id: string; v: number; ok: boolean; error?: string; staffId: string; name: string; at: string }
export interface SessionRow { id: string; staffId: string; exp: number }
export interface BackupRow { name: string; at: string; v: number; size: number; reason: string }

export interface Commit { head: Omit<Head, 'secret' | 'serverId'>; records: Change[]; ops: OpRow[] }

export interface Repo {
  readonly kind: 'mongodb' | 'sqlite'
  /** creates tables / indexes; safe to run on every start */
  init(): Promise<void>
  /** null when the database has never been set up */
  head(): Promise<Head | null>
  /** writes the very first head (with a new secret) */
  createHead(h: Head): Promise<void>
  records(): Promise<Change[]>
  /** saves changed records, their operations and the new head together, or nothing at all */
  commit(c: Commit): Promise<void>
  /** replaces every record (restore from backup) */
  replaceAll(c: Commit): Promise<void>
  findOp(id: string): Promise<OpRow | null>
  putSession(s: SessionRow): Promise<void>
  getSession(id: string): Promise<SessionRow | null>
  deleteSession(id: string): Promise<void>
  deleteSessionsFor(staffId: string): Promise<void>
  putBackup(b: BackupRow, gz: Buffer, keep: number): Promise<void>
  listBackups(): Promise<BackupRow[]>
  getBackup(name: string): Promise<Buffer | null>
  /** removes expired sessions and operation ids older than the retention window */
  purge(now: number): Promise<void>
  ping(): Promise<boolean>
  close(): Promise<void>
}

/** operation ids are remembered this long so a counter that comes back online late is still deduplicated */
export const OPLOG_DAYS = 90
