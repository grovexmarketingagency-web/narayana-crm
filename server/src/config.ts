/* All settings come from environment variables (see .env.example). Bad values stop the server at start-up
   with a clear message instead of failing later in the middle of a bill. */
import path from 'node:path'

export interface Config {
  port: number; host: string
  mongoUri?: string; mongoDb: string
  dataDir: string; distDir: string
  shopName: string; ownerName: string; ownerPin?: string; seedDemo: boolean
  sessionHours: number; backupHours: number; keepBackups: number
  trustProxy: boolean; cookieSecure: 'auto' | boolean
  production: boolean
  loginTries: number
}

function num(env: NodeJS.ProcessEnv, k: string, def: number, min: number, max: number): number {
  const raw = env[k]; if (raw === undefined || raw === '') return def
  const n = Number(raw)
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${k} must be a number between ${min} and ${max} (got "${raw}")`)
  return n
}
const bool = (v: string | undefined) => v === '1' || v === 'true' || v === 'yes'

export function loadConfig(env: NodeJS.ProcessEnv = process.env, root = process.cwd()): Config {
  const ownerPin = env.OWNER_PIN || undefined
  if (ownerPin && !/^\d{4,8}$/.test(ownerPin)) throw new Error('OWNER_PIN must be 4 to 8 digits')
  const mongoUri = env.MONGODB_URI || undefined
  if (mongoUri && !/^mongodb(\+srv)?:\/\//.test(mongoUri)) throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://')
  const production = env.NODE_ENV === 'production'
  if (production && bool(env.SEED_DEMO) && !bool(env.ALLOW_DEMO_IN_PRODUCTION)) throw new Error('SEED_DEMO is on in production. Demo PINs are public, so set OWNER_PIN instead (or ALLOW_DEMO_IN_PRODUCTION=1 for a demo server).')
  return {
    port: num(env, 'PORT', 4545, 1, 65535),
    host: env.HOST || '0.0.0.0',
    mongoUri, mongoDb: env.MONGODB_DB || 'narayana',
    dataDir: path.resolve(root, env.DATA_DIR || 'server/data'),
    distDir: path.resolve(root, env.DIST_DIR || 'dist'),
    shopName: (env.SHOP_NAME || 'Narayana Textiles').slice(0, 120),
    ownerName: (env.OWNER_NAME || 'Owner').slice(0, 120),
    ownerPin, seedDemo: bool(env.SEED_DEMO),
    sessionHours: num(env, 'SESSION_HOURS', 16, 1, 24 * 30),
    backupHours: num(env, 'BACKUP_HOURS', 24, 0, 24 * 7),
    keepBackups: num(env, 'KEEP_BACKUPS', 30, 1, 1000),
    trustProxy: bool(env.TRUST_PROXY),
    cookieSecure: env.COOKIE_SECURE === undefined || env.COOKIE_SECURE === 'auto' ? 'auto' : bool(env.COOKIE_SECURE),
    production,
    loginTries: num(env, 'LOGIN_TRIES_PER_15MIN', 20, 1, 100000),
  }
}
