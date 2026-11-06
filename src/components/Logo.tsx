/* Original Narayana Textiles mark: a woven "N" monogram (warp and weft threads) in maroon and gold. */
export function Logo({ size = 36 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <rect x="2" y="2" width="44" height="44" rx="12" fill="rgb(var(--accent))" />
    <g stroke="rgb(var(--gold))" strokeWidth="1.2" opacity=".55">{[12, 18, 24, 30, 36].map(y => <line key={y} x1="8" x2="40" y1={y} y2={y} />)}</g>
    <path d="M14 36V12l20 24V12" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="34" cy="12" r="3" fill="rgb(var(--gold))" />
  </svg>
}
export function Wordmark() {
  return <div className="flex items-center gap-2.5"><Logo /><div className="leading-tight"><div className="font-display text-lg font-semibold">Narayana</div><div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">Textiles</div></div></div>
}
