/* Keeps a copy of the app on each counter so it still opens when the server PC is off or the network drops.
   The app's data is not cached here (it lives in IndexedDB); /api requests always go to the network. */
const CACHE = 'narayana-app-v1'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  e.respondWith((async () => {
    const cache = await caches.open(CACHE)
    try {
      const res = await fetch(e.request)
      if (res.ok) cache.put(e.request.mode === 'navigate' ? './' : e.request, res.clone())
      return res
    } catch {
      return (await cache.match(e.request.mode === 'navigate' ? './' : e.request)) || Response.error()
    }
  })())
})
