import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { Button } from './ui'

/* Phone or webcam as a scanner: reads QR stickers and printed barcodes (Code 128, EAN, UPC).
   Uses the browser's built-in detector where there is one, otherwise a bundled reader. Keeps scanning
   until closed, so a whole pile can be scanned one after another; the same code is ignored for 1.5 seconds. */
type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> }

export function CameraScanButton({ onCode, label = 'Scan with camera' }: { onCode: (code: string) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null
  return <>
    <Button type="button" variant="secondary" onClick={() => setOpen(true)} aria-label={label} title={label}><Camera size={18} /><span className="hidden sm:inline">Camera</span></Button>
    {open && <CameraScan onCode={onCode} onClose={() => setOpen(false)} />}
  </>
}

export function CameraScan({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState('')
  const [last, setLast] = useState('')
  const cb = useRef(onCode); cb.current = onCode
  useEffect(() => {
    let stop = false, stream: MediaStream | undefined, controls: { stop: () => void } | undefined
    let prev = '', prevAt = 0
    const hit = (code: string) => {
      const now = Date.now(); if (!code || (code === prev && now - prevAt < 1500)) return
      prev = code; prevAt = now; setLast(code); try { navigator.vibrate?.(60) } catch { /* */ } cb.current(code)
    }
    ;(async () => {
      try {
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
        if (BD) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
          if (stop) return stream.getTracks().forEach(t => t.stop())
          const v = video.current!; v.srcObject = stream; await v.play()
          const det = new BD({ formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_39'] })
          const loop = async () => { if (stop) return; try { const r = await det.detect(v); if (r[0]) hit(r[0].rawValue.trim()) } catch { /* frame not ready */ } setTimeout(loop, 150) }
          void loop()
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser')
          const reader = new BrowserMultiFormatReader()
          controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video.current!, r => { if (r) hit(r.getText().trim()) })
          if (stop) controls.stop()
        }
      } catch (e) {
        setErr((e as Error).name === 'NotAllowedError' ? 'Camera permission was refused. Allow the camera for this site in the browser settings.' : 'No camera found on this device.')
      }
    })()
    return () => { stop = true; controls?.stop(); stream?.getTracks().forEach(t => t.stop()) }
  }, [])
  return <div className="fixed inset-0 z-[70] flex flex-col bg-black/90 p-4" role="dialog" aria-label="Camera scanner">
    <div className="mb-3 flex items-center justify-between text-white"><span className="font-medium">Point the camera at a sticker or barcode</span>
      <button onClick={onClose} aria-label="Close camera" className="rounded-full p-2 hover:bg-white/10"><X /></button></div>
    <div className="relative mx-auto w-full max-w-xl flex-1 overflow-hidden rounded-lg">
      <video ref={video} className="h-full w-full object-cover" muted playsInline />
      <div className="pointer-events-none absolute inset-x-10 top-1/2 h-40 -translate-y-1/2 rounded-lg border-4 border-gold/80" />
    </div>
    <div className="mt-3 text-center text-sm text-white">{err || (last ? `Added ${last}. Keep scanning or close.` : 'Scanning…')}</div>
  </div>
}
