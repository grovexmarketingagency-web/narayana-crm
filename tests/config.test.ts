import { describe, it, expect } from 'vitest'
import { loadConfig } from '../server/src/config'
const env = (e: Record<string, string>) => e as NodeJS.ProcessEnv

describe('settings', () => {
  it('has safe defaults', () => { const c = loadConfig(env({})); expect(c.port).toBe(4545); expect(c.mongoUri).toBeUndefined(); expect(c.backupHours).toBe(24) })
  it('stops on bad values with a clear message', () => {
    expect(() => loadConfig(env({ PORT: 'abc' }))).toThrow(/PORT/)
    expect(() => loadConfig(env({ OWNER_PIN: '12' }))).toThrow(/OWNER_PIN/)
    expect(() => loadConfig(env({ MONGODB_URI: 'http://x' }))).toThrow(/MONGODB_URI/)
  })
  it('refuses public demo PINs in production', () => {
    expect(() => loadConfig(env({ NODE_ENV: 'production', SEED_DEMO: '1' }))).toThrow(/Demo PINs/)
  })
})
