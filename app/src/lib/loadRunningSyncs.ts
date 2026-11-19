import type { SupabaseClient } from '@supabase/supabase-js'
import type { Account } from '../data'

export type RunningSync = {
  account_id: string
  connection_id: string
  pages_fetched: number
  rows_seen: number
  rows_inserted: number
  rows_updated: number
}

type Embedded<T> = T | T[] | null
type Mapping = { account_id: string }
type JoinedRun = Omit<RunningSync, 'account_id'> & {
  provider: Embedded<{ mappings: Embedded<Mapping> }>
}

function rows<T>(value: Embedded<T>): T[] {
  return value === null ? [] : Array.isArray(value) ? value : [value]
}

export async function loadRunningSyncs(db: SupabaseClient, accounts: Pick<Account, 'id' | 'accountConnectionId'>[]): Promise<RunningSync[]> {
  const ids = accounts.filter(account => account.accountConnectionId).map(account => account.id)
  if (!ids.length) return []

  const { data } = await db.from('sync_runs')
    .select(`connection_id, pages_fetched, rows_seen, rows_inserted, rows_updated,
      provider:provider_connections!sync_runs_connection_id_fkey!inner(
        mappings:account_connections!account_connections_connection_id_fkey!inner(account_id)
      )`)
    .in('provider.mappings.account_id', ids)
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .returns<JoinedRun[]>()

  return (data ?? []).flatMap(({ provider, ...run }) => {
    // The previous map kept the last returned account for each shared connection.
    const mapping = rows(provider).flatMap(connection => rows(connection.mappings)).at(-1)
    return mapping ? [{ ...run, account_id: mapping.account_id }] : []
  })
}
