import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useReport } from './useReport'

export function useKeysetPage<T, C>(params: unknown, load: (tenant: string, cursor: C | null) => Promise<T>, enabled = true) {
  const { user, tenantId } = useAuth()
  const { reportRevision } = useData()
  const scope = JSON.stringify([user?.id, tenantId, reportRevision, params])
  const [history, setHistory] = useState<{ scope: string; cursors: C[] }>({ scope, cursors: [] })
  if (history.scope !== scope) setHistory({ scope, cursors: [] })
  const cursors = history.scope === scope ? history.cursors : []
  const cursor = cursors.at(-1) ?? null
  const report = useReport([scope, cursor], tenant => load(tenant, cursor), enabled)
  return {
    ...report, page: cursors.length + 1,
    previous: () => setHistory({ scope, cursors: cursors.slice(0, -1) }),
    next: (after: C) => setHistory({ scope, cursors: [...cursors, after] }),
  }
}
