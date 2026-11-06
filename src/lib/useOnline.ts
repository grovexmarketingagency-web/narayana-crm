import { useEffect, useState } from 'react'
export function useOnline() {
  const [on, set] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => { const a = () => set(true), b = () => set(false); window.addEventListener('online', a); window.addEventListener('offline', b); return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b) } }, [])
  return on
}
