/* Backups also go to a folder outside the database, so a broken database or disk still leaves a copy. */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import zlib from 'node:zlib'
import { startServer, counter } from './helpers'

describe('backup copy folder', () => {
  it('writes every backup as a file, keeps only the newest, and the copy restores', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-copy-'))
    const srv = await startServer(); srv.engine.copyDir = path.join(dir, 'pen-drive')
    for (let i = 0; i < 3; i++) { await srv.engine.backup('test'); await new Promise(r => setTimeout(r, 1100)) }
    ;(srv.engine as unknown as { keepBackups: number }).keepBackups = 2; await srv.engine.backup('test')
    const files = fs.readdirSync(srv.engine.copyDir).sort()
    expect(files.length).toBe(2); expect(files.every(f => /^narayana-backup-.*\.json\.gz$/.test(f))).toBe(true)
    const db = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(srv.engine.copyDir, files[1]))).toString())
    expect(db.staff.length).toBe(srv.engine.state.staff.length)
    const h = await counter(srv.url).call('/health')
    expect(h.body).toMatchObject({ ok: true, backupLate: false, backupCopy: 'ok' })
    expect(JSON.stringify(h.body)).not.toContain(dir)        // the folder path is not shown to the public
    await srv.close()
  }, 15000)
  it('a missing folder does not stop the backup, and health says the copy is failing', async () => {
    const srv = await startServer()
    const blocker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nt-copy-')), 'file'); fs.writeFileSync(blocker, 'x')
    srv.engine.copyDir = path.join(blocker, 'sub')          // a folder inside a file cannot be made
    const row = await srv.engine.backup('test')
    expect((await srv.repo.listBackups())[0].name).toBe(row.name)
    expect((await counter(srv.url).call('/health')).body.backupCopy).toBe('failing')
    expect(srv.engine.copyError).toBeTruthy()
    await srv.close()
  })
})
