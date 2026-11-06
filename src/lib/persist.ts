/* Durable storage on each counter. IndexedDB holds hundreds of MB and survives browser restarts;
   when it is blocked (private window, some previews) we fall back to localStorage, then to memory only. */
const DBN = 'narayana-crm', STORE = 'kv'
let idb: Promise<IDBDatabase | null> | null = null
const mem = new Map<string, unknown>()

function open(): Promise<IDBDatabase | null> {
  if (idb) return idb
  idb = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const r = indexedDB.open(DBN, 1)
      r.onupgradeneeded = () => { r.result.createObjectStore(STORE) }
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => resolve(null)
      r.onblocked = () => resolve(null)
      setTimeout(() => resolve(null), 3000)
    } catch { resolve(null) }
  })
  return idb
}
const lsKey = (k: string) => 'narayana-kv:' + k

export async function getMany(keys: string[]): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  const db = await open()
  if (db) {
    try {
      await new Promise<void>((ok, bad) => {
        const tx = db.transaction(STORE, 'readonly'); const st = tx.objectStore(STORE)
        for (const k of keys) { const r = st.get(k); r.onsuccess = () => { if (r.result !== undefined) out[k] = r.result } }
        tx.oncomplete = () => ok(); tx.onerror = () => bad(tx.error)
      })
      return out
    } catch { /* fall through */ }
  }
  for (const k of keys) {
    if (mem.has(k)) { out[k] = mem.get(k); continue }
    try { const s = localStorage.getItem(lsKey(k)); if (s !== null) out[k] = JSON.parse(s) } catch { /* blocked */ }
  }
  return out
}

/** writes all entries together: either every key is saved or none is (IndexedDB transaction) */
export async function setMany(entries: Record<string, unknown>): Promise<'idb' | 'local' | 'memory'> {
  const db = await open()
  if (db) {
    try {
      await new Promise<void>((ok, bad) => {
        const tx = db.transaction(STORE, 'readwrite', { durability: 'strict' } as IDBTransactionOptions); const st = tx.objectStore(STORE)
        for (const [k, v] of Object.entries(entries)) v === undefined ? st.delete(k) : st.put(v, k)
        tx.oncomplete = () => ok(); tx.onerror = () => bad(tx.error); tx.onabort = () => bad(tx.error)
      })
      return 'idb'
    } catch (e) { console.warn('IndexedDB write failed', e) }
  }
  for (const [k, v] of Object.entries(entries)) mem.set(k, v)
  try { for (const [k, v] of Object.entries(entries)) v === undefined ? localStorage.removeItem(lsKey(k)) : localStorage.setItem(lsKey(k), JSON.stringify(v)); return 'local' } catch { return 'memory' }
}

/** asks the browser not to clear this site's data when the disk is low */
export async function keepData() { try { await navigator.storage?.persist?.() } catch { /* not supported */ } }
