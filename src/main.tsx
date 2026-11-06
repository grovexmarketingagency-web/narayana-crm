import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
// opened from the central server: keep a copy of the app so it opens even when the server is off
if (/^https?:$/.test(location.protocol) && 'serviceWorker' in navigator && !import.meta.env.DEV) {
  try { if (window.top === window) void navigator.serviceWorker.register('./sw.js').catch(() => undefined) } catch { /* sandboxed preview */ }
}
