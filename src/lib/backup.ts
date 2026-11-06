import { api, getDB } from './store'
import { localToday } from './format'
/* Scheduled automatic backups on this computer.
   1) Always: a copy kept inside the browser's own database (last 14).
   2) If the owner picked a backup folder (Chrome/Edge on the shop PC): a JSON file written there too. */
const DBN = 'narayana-backups', ST = 'snaps', META = 'meta'
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open(DBN, 1); r.onupgradeneeded = () => { r.result.createObjectStore(ST, { keyPath: 'at' }); r.result.createObjectStore(META) }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
}
async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await idb(); return new Promise((res, rej) => { const r = fn(d.transaction(store, mode).objectStore(store)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
}
export type Snap = { at: string; size: number; data?: string }
export async function listSnaps(): Promise<Snap[]> {
  try { const all = await tx<Snap[]>(ST, 'readonly', s => s.getAll() as IDBRequest<Snap[]>); return all.map(x => ({ at: x.at, size: x.size })).sort((a, b) => b.at.localeCompare(a.at)) } catch { return [] }
}
export async function getSnap(at: string) { return (await tx<Snap>(ST, 'readonly', s => s.get(at) as IDBRequest<Snap>))?.data || '' }
type DirHandle = { name: string; getFileHandle: (n: string, o: { create: boolean }) => Promise<{ createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }> }>; queryPermission?: (o: object) => Promise<string>; requestPermission?: (o: object) => Promise<string> }
export const folderSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window
export async function getFolder(): Promise<DirHandle | undefined> { try { return await tx<DirHandle>(META, 'readonly', s => s.get('folder') as IDBRequest<DirHandle>) } catch { return undefined } }
export async function pickFolder() {
  const h = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker({ mode: 'readwrite' })
  await tx(META, 'readwrite', s => s.put(h, 'folder')); return h.name
}
export async function folderReady(h: DirHandle, ask = false) {
  const o = { mode: 'readwrite' }; if ((await h.queryPermission?.(o)) === 'granted') return true
  return ask ? (await h.requestPermission?.(o)) === 'granted' : false
}
export async function backupNow(reason = 'manual'): Promise<string> {
  const data = api.exportJSON(); const at = new Date().toISOString()
  await tx(ST, 'readwrite', s => s.put({ at, size: data.length, data }))
  const all = await listSnaps(); for (const old of all.slice(14)) await tx(ST, 'readwrite', s => s.delete(old.at))
  await tx(META, 'readwrite', s => s.put(at, 'last'))
  let where = 'this computer'
  const h = await getFolder()
  if (h && await folderReady(h)) { const f = await h.getFileHandle(`narayana-backup-${localToday()}-${at.slice(11, 16).replace(':', '')}.json`, { create: true }); const w = await f.createWritable(); await w.write(data); await w.close(); where = `folder "${h.name}"` }
  void reason; return where
}
export async function lastBackup(): Promise<string | undefined> { try { return await tx<string>(META, 'readonly', s => s.get('last') as IDBRequest<string>) } catch { return undefined } }
let timer: ReturnType<typeof setInterval> | undefined
export function startAutoBackup() {
  if (typeof indexedDB === 'undefined') return
  const check = async () => {
    const hours = getDB().shop.autoBackupHours; if (!hours) return
    const last = await lastBackup()
    if (!last || Date.now() - +new Date(last) >= hours * 3600e3) { try { await backupNow('scheduled') } catch { /* storage blocked */ } }
  }
  void check(); clearInterval(timer); timer = setInterval(check, 15 * 60e3)
}
