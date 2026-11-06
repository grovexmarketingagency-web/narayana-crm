/* Same checks against real MongoDB. Runs when MONGODB_URI is set (CI starts a MongoDB service for this). */
import { describe, it, expect } from 'vitest'
import { MongoClient } from 'mongodb'
import { MongoRepo } from '../server/src/repo-mongo'
import { Engine } from '../server/src/engine'
import { startServer, counter, op, cashBill } from './helpers'

// MONGODB_URI: a standalone server (no transactions). MONGODB_URI_RS: a replica set (with transactions, like Atlas).
const targets = [['standalone', process.env.MONGODB_URI], ['replica set', process.env.MONGODB_URI_RS]].filter(([, u]) => u) as [string, string][]
describe.skipIf(!targets.length).each(targets.length ? targets : [['none', '']])('MongoDB storage (%s)', (_kind, uri) => {
  it('saves bills once, survives a restart, restores backups and expires old data', async () => {
    const dbName = 'narayana_test_' + Date.now()
    const a = await startServer({ repo: new MongoRepo(uri, dbName) })
    const c = counter(a.url); await c.login('s3', '1111')
    const o = op('checkout', cashBill(a.engine.state, 'mongo1'))
    expect((await c.ops([o])).body.results[0].ok).toBe(true)
    expect((await c.ops([o])).body.results[0].dup).toBe(true)
    const snapshot = JSON.stringify(a.engine.state)
    await a.close()

    const repo = new MongoRepo(uri, dbName)
    const e = await Engine.open(repo, () => { throw new Error('should not seed again') })
    expect(JSON.stringify(e.state)).toBe(snapshot)
    const b = await e.backup('test'); expect((await repo.listBackups())[0].name).toBe(b.name)
    await e.restore(JSON.parse((await e.readBackup(b.name))!), 's1')
    expect(e.state.bills.some(x => x.id === 'mongo1')).toBe(true)
    await repo.close()

    const cl = new MongoClient(uri); await cl.connect()
    const idx = await cl.db(dbName).collection('sessions').indexes()
    expect(idx.some(i => i.expireAfterSeconds === 0)).toBe(true)
    await cl.db(dbName).dropDatabase(); await cl.close()
  })
})
