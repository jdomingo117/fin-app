import { createClient } from '@supabase/supabase-js'
import { expect, it, vi } from 'vitest'
import { loadRunningSyncs } from './loadRunningSyncs'

it('polls once for the current mappings and skips accounts without a mapping', async () => {
  const request = vi.fn<typeof fetch>()
  const db = createClient('https://unused.invalid', 'offline-key', {
    global: { fetch: request }, auth: { persistSession: false, autoRefreshToken: false },
  })
  expect(await loadRunningSyncs(db, [{ id: 'a' }])).toEqual([])
  expect(request).not.toHaveBeenCalled()

  const accounts = ['a', 'b'].map(id => ({ id, accountConnectionId: 'row-' + id }))
  const run = { connection_id: 'old', pages_fetched: 1, rows_seen: 4, rows_inserted: 2, rows_updated: 2 }
  request.mockResolvedValueOnce(Response.json([{ ...run, provider: { mappings: accounts.map(a => ({ account_id: a.id })) } }]))
  expect(await loadRunningSyncs(db, accounts)).toEqual([{ ...run, account_id: 'b' }])
  const url = new URL(String(request.mock.calls[0][0]))
  expect(url.pathname).toBe('/rest/v1/sync_runs')
  expect(url.searchParams.get('provider.mappings.account_id')).toBe('in.(a,b)')
  expect(url.searchParams.get('status')).toBe('eq.running')
  expect(url.searchParams.get('order')).toBe('started_at.desc')
  expect(url.searchParams.get('select')).toContain('provider:provider_connections!sync_runs_connection_id_fkey!inner(mappings:account_connections!account_connections_connection_id_fkey!inner(account_id))')

  request.mockResolvedValueOnce(Response.json([{ ...run, connection_id: 'new', provider: [{ mappings: { account_id: 'a' } }] }]))
  expect(await loadRunningSyncs(db, accounts)).toEqual([{ ...run, connection_id: 'new', account_id: 'a' }])
  request.mockResolvedValueOnce(Response.json([{ ...run, provider: null }, { ...run, provider: { mappings: [] } }]))
  expect(await loadRunningSyncs(db, accounts)).toEqual([])
  expect(request).toHaveBeenCalledTimes(3)
})
