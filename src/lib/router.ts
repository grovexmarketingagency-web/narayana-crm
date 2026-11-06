import { useSyncExternalStore } from 'react'
/* Hash router that also works inside sandboxed frames: the route lives in memory and
   is mirrored to location.hash when the browser allows it. */
let route = (typeof location !== 'undefined' && location.hash.replace(/^#/, '')) || '/'
const subs = new Set<() => void>()
const emit = () => subs.forEach(f => f())
export function go(path: string) {
  if (path === route) return
  route = path; emit()
  try { if (location.hash.replace(/^#/, '') !== path) location.hash = path } catch { /* sandboxed */ }
}
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => { const h = location.hash.replace(/^#/, '') || '/'; if (h !== route) { route = h; emit() } })
  // in-app links like <a href="#/bills/123">
  document.addEventListener('click', e => {
    const a = (e.target as HTMLElement).closest?.('a[href^="#/"]') as HTMLAnchorElement | null
    if (a && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(a.getAttribute('href')!.slice(1)) }
  })
}
export function useRoute() { return useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f) }, () => route) }
export const currentRoute = () => route
