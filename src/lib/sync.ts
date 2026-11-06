/* The shop's data stored as separate records, so the server only saves and sends what changed.
   Shared by the app and the server.

   Every record has:
     c  collection name ('bills', 'variants', … or '$meta' for shop settings, counters, permissions, version)
     i  record id
     v  database version when it last changed
     s  creation order (keeps lists in the same order on every counter, even after a restart)
     d  the record itself, or null when it was deleted (kept as a marker so other counters delete it too) */
import type { DB } from './types'

export interface Change { c: string; i: string; v: number; s: number; d: unknown }

/** list collections synced with the server (drafts stay on each counter) */
export const LISTS = ['staff', 'products', 'variants', 'customers', 'salesmen', 'suppliers', 'bills', 'offers', 'vouchers', 'alterations', 'purchases',
  'stockCounts', 'expenses', 'creditPayments', 'returns', 'audit', 'incomes', 'supplierPayments'] as const
export const METAS = ['version', 'shop', 'counters', 'permissions'] as const
export type ListName = (typeof LISTS)[number]
/** lists where new entries go to the top (newest first); the rest add new entries at the bottom */
export const NEWEST_FIRST = new Set<string>(['vouchers', 'alterations', 'purchases', 'stockCounts', 'expenses', 'creditPayments', 'returns', 'audit', 'incomes', 'supplierPayments'])

type Rec = { id: string }
const list = (db: DB, c: string) => (db as unknown as Record<string, Rec[]>)[c]
const key = (c: string, i: string) => c + '/' + i
export type Seqs = Record<string, number>

export function emptyDB(): DB {
  const d = { drafts: [] } as unknown as Record<string, unknown>
  for (const c of LISTS) d[c] = []
  d.version = 0; d.counters = {}; d.permissions = {}; d.shop = {}
  return d as unknown as DB
}

/** Records that differ between two versions of the data (compares by object identity, so use with immer). */
export function diff(prev: DB, next: DB): { c: string; i: string; d: unknown }[] {
  const out: { c: string; i: string; d: unknown }[] = []
  for (const k of METAS) if ((prev as unknown as Record<string, unknown>)[k] !== (next as unknown as Record<string, unknown>)[k]) out.push({ c: '$meta', i: k, d: (next as unknown as Record<string, unknown>)[k] })
  for (const c of LISTS) {
    const a = list(prev, c), b = list(next, c)
    if (a === b) continue
    const old = new Map(a.map(r => [r.id, r]))
    const ordered = NEWEST_FIRST.has(c) ? [...b].reverse() : b     // so new records get creation numbers in the right order
    for (const r of ordered) { if (old.get(r.id) !== r) out.push({ c, i: r.id, d: r }); old.delete(r.id) }
    for (const id of old.keys()) out.push({ c, i: id, d: null })
  }
  return out
}

/** Gives creation numbers to records that have none yet. Returns the next free number. */
export function assignSeqs(seqs: Seqs, changes: { c: string; i: string; d: unknown }[], next: number): number {
  for (const ch of changes) { const k = key(ch.c, ch.i); if (seqs[k] === undefined) seqs[k] = next++ }
  return next
}

/** Every record of a database, numbered in its current order. Used to seed a new server and for full restores. */
export function toChanges(db: DB, v: number): Change[] {
  const out: Change[] = []; let s = 1
  for (const k of METAS) out.push({ c: '$meta', i: k, v, s: 0, d: (db as unknown as Record<string, unknown>)[k] })
  for (const c of LISTS) { const l = list(db, c) || []; const ordered = NEWEST_FIRST.has(c) ? [...l].reverse() : l; for (const r of ordered) out.push({ c, i: r.id, v, s: s++, d: r }) }
  return out
}

function sortList(db: DB, c: string, seqs: Seqs) {
  const l = list(db, c); const dir = NEWEST_FIRST.has(c) ? -1 : 1
  const n = (r: Rec) => seqs[key(c, r.id)] ?? Number.MAX_SAFE_INTEGER
  l.sort((x, y) => dir * (n(x) - n(y)) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
}

/** Applies records from the server onto a copy of the data (mutates `db` and `seqs`). */
export function applyChanges(db: DB, seqs: Seqs, changes: Change[]) {
  const touched = new Set<string>()
  const byColl = new Map<string, Change[]>()
  for (const ch of changes) { if (ch.c === '$meta') { (db as unknown as Record<string, unknown>)[ch.i] = ch.d; continue } (byColl.get(ch.c) ?? byColl.set(ch.c, []).get(ch.c)!).push(ch) }
  for (const [c, chs] of byColl) {
    if (!(LISTS as readonly string[]).includes(c)) continue
    const l = list(db, c); const idx = new Map(l.map((r, i) => [r.id, i]))
    const gone = new Set<string>()
    for (const ch of chs) {
      const k = key(c, ch.i)
      if (ch.d === null) { gone.add(ch.i); delete seqs[k]; continue }
      gone.delete(ch.i); seqs[k] = ch.s
      const at = idx.get(ch.i)
      if (at !== undefined) l[at] = ch.d as Rec; else { idx.set(ch.i, l.length); l.push(ch.d as Rec) }
    }
    if (gone.size) (db as unknown as Record<string, Rec[]>)[c] = l.filter(r => !gone.has(r.id))
    touched.add(c)
  }
  for (const c of touched) sortList(db, c, seqs)
}

/** Builds a whole database from its records. */
export function fromChanges(changes: Change[]): { db: DB; seqs: Seqs } {
  const db = emptyDB(); const seqs: Seqs = {}
  applyChanges(db, seqs, changes.filter(ch => ch.d !== null))
  return { db, seqs }
}
