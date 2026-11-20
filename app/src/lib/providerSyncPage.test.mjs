import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { beforeAll, expect, it, vi } from 'vitest'

vi.mock('https://deno.land/x/zod@v3.22.4/mod.ts', () => {
  const schema = { uuid: () => schema, optional: () => schema, default: () => schema }
  return { z: { object: () => schema, string: () => schema, enum: () => schema } }
})
vi.mock('../../../supabase/functions/_shared/withAuth.ts', () => ({ withAuth: (_, handler) => handler }))
vi.mock('../../../supabase/functions/_shared/rateLimit.ts', () => ({ LIMITS: {} }))
vi.mock('../../../supabase/functions/_shared/crypto.ts', () => ({
  decryptToken: async () => 'token', redactProviderTokens: String, TokenDecryptError: class extends Error {},
}))
vi.mock('../../../supabase/functions/_shared/runLinkTransfers.ts', () => ({ runLinkTransfers: vi.fn() }))
vi.mock('../../../supabase/functions/_shared/runInvestmentCashLinks.ts', () => ({ runInvestmentCashLinks: vi.fn() }))
vi.mock('../../../supabase/functions/_shared/upClient.ts', () => ({
  fetchTransactionPage: vi.fn(), buildTransactionsUrl: () => 'page',
  listUpAccounts: vi.fn(async () => []), UpAuthError: class extends Error {}, UpApiError: class extends Error {},
}))
import { fetchTransactionPage } from '../../../supabase/functions/_shared/upClient.ts'

let sync
beforeAll(async () => {
  vi.stubGlobal('Deno', { serve: handler => { sync = handler } })
  try { await import('../../../supabase/functions/sync-provider/index.ts') }
  finally { vi.unstubAllGlobals() }
})

const manual = { category: 'Food', subcategory: 'Groceries', category_source: 'user', category_confidence: 0.8, needs_review: true }
const identity = id => '\\x' + createHash('sha256').update('provider:up:v1 ' + id).digest('hex')

function fixture() {
  const mapping = { id: 'mapping', account_id: 'account', provider_account_id: 'up-account',
    cutover_date: '2024-03-01', backfill_done: false, backfill_cursor: 'resume', synced_through: null }
  const connection = { id: 'connection', provider: 'up', status: 'active' }
  const ledger = new Map([[identity('edited'), { external_id: 'edited', ...manual }]])
  const state = { mapping, ledger, failRead: false, writes: 0, run: {} }
  fetchTransactionPage.mockResolvedValue({ next: null, transactions: ['edited', 'new'].map(id => ({
    id, description: 'Store', createdAt: '2024-03-02T12:00:00Z', status: 'SETTLED', amount: { valueInBaseUnits: -40 },
  })) })

  async function request(input, init) {
    const url = new URL(input)
    const table = url.pathname.split('/').pop()
    const body = init.body && JSON.parse(init.body)
    function reply(data) { return Response.json(data) }
    switch (table) {
      case 'provider_connections':
        if (body) Object.assign(connection, body)
        return reply([connection])
      case 'account_connections':
        if (body) Object.assign(mapping, body)
        return reply([mapping])
      case 'sync_runs':
        if (body) Object.assign(state.run, body)
        return reply({ id: 'run' })
      case 'provider_credentials': return reply([{ ciphertext: 'fixture' }])
      case 'merchant_rules': return reply([{ merchant_key: 'store', category: 'Other', subcategory: null }])
      case 'budget_provider_coverage_base':
      case 'budget_provider_coverage_extend': return reply({})
      case 'transactions':
        if (init.method === 'POST') {
          expect(url.searchParams.get('on_conflict')).toBe('account_id,dedupe_hash,occurrence')
          for (const row of body) {
            expect(row.account_id).toBe(mapping.account_id)
            expect(row.occurrence).toBe(0)
            expect(row.dedupe_hash).toBe(identity(row.external_id))
            ledger.set(row.dedupe_hash, row)
          }
          state.writes++
          return reply(null)
        }
        if (url.searchParams.has('pending')) return reply([])
        if (state.failRead) return Response.json({ message: 'injected read failure' }, { status: 500 })
        return reply([...ledger.values()])
      default: throw Error('Unexpected request ' + url.pathname)
    }
  }
  const db = createClient('https://unused.invalid', 'fixture', { global: { fetch: request } })
  state.sync = () => sync({ body: { connection_id: connection.id, trigger: 'manual' },
    db, admin: () => db, tenantId: 'tenant', user: { id: 'user' }, audit: vi.fn() })
  return state
}

it('preserves the manual classification over the matching rule and applies the rule to new rows', async () => {
  const f = fixture()
  expect(await f.sync()).toMatchObject({ done: true, progress: { rows_inserted: 1, rows_updated: 1 } })
  expect(f.ledger.get(identity('edited'))).toMatchObject(manual)
  expect(f.ledger.get(identity('new'))).toMatchObject({ category: 'Other', category_source: 'user' })
})

it('fails the page before writing or checkpointing and retries from the stored cursor', async () => {
  const f = fixture()
  const before = structuredClone(f.mapping)
  f.failRead = true
  expect(await f.sync()).toHaveProperty('error')
  expect(f.run).toMatchObject({ status: 'failed', rows_inserted: 0, rows_updated: 0 })
  expect(f.mapping).toEqual(before)
  expect(f.writes).toBe(0)
  expect([...f.ledger.values()]).toEqual([{ external_id: 'edited', ...manual }])
  f.failRead = false
  expect(await f.sync()).toMatchObject({ done: true, progress: { rows_inserted: 1, rows_updated: 1 } })
  expect(fetchTransactionPage).toHaveBeenLastCalledWith('resume', 'token')
  expect(f.mapping).toMatchObject({ backfill_done: true, backfill_cursor: null })
  expect(await f.sync()).toMatchObject({ done: true, progress: { rows_inserted: 0, rows_updated: 2 } })
  expect(f.ledger.size).toBe(2)
  expect(f.ledger.get(identity('edited'))).toMatchObject(manual)
})
