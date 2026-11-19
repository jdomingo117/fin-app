import { useCallback, useEffect, useState } from 'react'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabaseClient'
import { providerSyncNoticeDetail } from '../lib/providerSyncStatus'
import { BackgroundOperationNotice } from './OperationStatus'

import { loadRunningSyncs, type RunningSync } from '../lib/loadRunningSyncs'

/**
 * A durable notice for provider work which may have been started by this or
 * another view. It derives its message from the server's running sync record;
 * it never pretends that a client-side request is the source of truth.
 */
export default function ProviderSyncNotice() {
  const { accounts } = useData()
  const [runs, setRuns] = useState<RunningSync[]>([])

  const load = useCallback(async () => {
    setRuns(await loadRunningSyncs(supabase, accounts))
  }, [accounts])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => { void load() }, 10_000)
    return () => window.clearInterval(interval)
  }, [load])

  if (!runs.length) return null

  const detail = providerSyncNoticeDetail(
    runs.map((run) => ({ accountId: run.account_id, pagesFetched: run.pages_fetched, rowsSeen: run.rows_seen, rowsInserted: run.rows_inserted, rowsUpdated: run.rows_updated })),
    new Map(accounts.map((account) => [account.id, account.name])),
  )

  return <div className="fixed bottom-[58px] right-4 z-40 w-[min(24rem,calc(100vw-2rem))] sm:right-8"><BackgroundOperationNotice title="Provider sync in progress" detail={detail} /></div>
}
