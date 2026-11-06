/* PINs, sessions and owner approvals.
   PINs are stored only as scrypt hashes. Sessions are random tokens kept in an httpOnly cookie; the database
   stores only a SHA-256 of the token, so a copied database cannot be used to log in. */
import crypto from 'node:crypto'

const N = 16384, R = 8, P = 1, LEN = 32

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16)
  const h = crypto.scryptSync(pin, salt, LEN, { N, r: R, p: P })
  return `scrypt$${N}$${salt.toString('base64')}$${h.toString('base64')}`
}
export function checkPin(pin: string, stored: string | undefined): boolean {
  if (!stored) { crypto.scryptSync(pin, 'no-user', LEN, { N, r: R, p: P }); return false }   // same time either way
  const [kind, n, salt, hash] = stored.split('$')
  if (kind !== 'scrypt' || !salt || !hash) return false
  const want = Buffer.from(hash, 'base64')
  const got = crypto.scryptSync(pin, Buffer.from(salt, 'base64'), want.length, { N: +n, r: R, p: P })
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}

export const newToken = () => crypto.randomBytes(32).toString('base64url')
export const tokenId = (token: string) => crypto.createHash('sha256').update(token).digest('base64url')
export const newSecret = () => crypto.randomBytes(32).toString('base64url')
export const newId = () => crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x')

/** owner approval for one bill: "<ownerId>.<signature>" */
export function approvalToken(secret: string, billId: string, ownerId: string): string {
  return ownerId + '.' + crypto.createHmac('sha256', secret).update(`approve:${billId}:${ownerId}`).digest('base64url')
}
export function readApproval(secret: string, billId: string, token: string): string | null {
  const dot = token.indexOf('.'); if (dot < 1) return null
  const ownerId = token.slice(0, dot)
  const want = Buffer.from(approvalToken(secret, billId, ownerId)), got = Buffer.from(token)
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? ownerId : null
}

/** sliding-window limiter: at most `max` hits per `windowMs` for each key */
export class Limiter {
  private hits = new Map<string, number[]>()
  constructor(private max: number, private windowMs: number) {
    setInterval(() => { const now = Date.now(); for (const [k, t] of this.hits) if (!t.length || now - t[t.length - 1] > this.windowMs) this.hits.delete(k) }, 60e3).unref()
  }
  /** records a hit; false when the key is over the limit */
  hit(key: string, now = Date.now()): boolean {
    const t = (this.hits.get(key) || []).filter(x => now - x < this.windowMs)
    t.push(now); this.hits.set(key, t)
    return t.length <= this.max
  }
  /** true when the key has used up its allowance (does not count as a hit) */
  full(key: string, now = Date.now()): boolean { return (this.hits.get(key) || []).filter(x => now - x < this.windowMs).length >= this.max }
  clear(key: string) { this.hits.delete(key) }
}
