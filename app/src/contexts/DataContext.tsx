import { readAccounts, readAccountConnections } from '../lib/accountDirectory'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Account } from '../data'
import { useAuth } from './AuthContext'

export type ProfileData = {
  callsign: string
}

interface DataCtx {
  reportRevision: number
  loadState: 'loading' | 'ready' | 'error'
  loadError: string | null
  isRefreshing: boolean
  refreshError: string | null
  profile: ProfileData
  isAdmin: boolean
  accounts: Account[]
  refreshProfile: () => Promise<void>
  invalidateReports: () => void
  refreshData: () => Promise<void>
}

const defaultProfile: ProfileData = { callsign: 'Operator' }

// A connection whose balance is older than this gets an automatic
// background sync on load — no spinner, no blocking, just current data by
// the time the user notices. Loose enough that a normal session doesn't
// re-trigger it (refreshData() runs after almost every mutation), tight
// enough that "stale for days" can't happen just from not opening the app.
const STALE_SYNC_MS = 30 * 60 * 1000
const STALE_INVESTMENT_SYNC_MS = 30 * 60 * 60 * 1000

export const DataContext = createContext<DataCtx>({
  reportRevision: 0,
  loadState: 'loading',
  loadError: null,
  isRefreshing: false,
  refreshError: null,
  profile: defaultProfile,
  isAdmin: false,
  accounts: [],
  refreshData: async () => {},
  refreshProfile: async () => {},
  invalidateReports: () => {},
})

export const useData = () => useContext(DataContext)

export function DataProvider({ children }: { children: ReactNode }) {
  const { session, tenantId, isAdmin } = useAuth()
  const userId = session?.user.id ?? null
  const [identity, setIdentity] = useState({ userId, tenantId })
  const activeIdentity = useRef<typeof identity | null>(identity)
  const [reportRevision, setReportRevision] = useState(0)
  const sequence = useRef(0)
  const profileSequence = useRef(0)
  const [loadState, setLoadState] = useState<DataCtx['loadState']>(userId ? 'loading' : 'ready')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileData>(defaultProfile)
  const [accounts, setAccounts] = useState<Account[]>([])
  // Connection ids already given a stale-sync this session — refreshData()
  // runs after nearly every mutation, and without this a single session
  // would fire the same background sync repeatedly instead of once.
  const staleSyncTriggered = useRef(new Set<string>())
  const staleInvestmentSyncTriggered = useRef(new Set<string>())
  const hasLoaded = useRef(false)

  // React retries this render before rendering descendants, so consumers
  // never see the previous user's data with the new session.
  if (identity.userId !== userId || identity.tenantId !== tenantId) {
    setIdentity({ userId, tenantId })
    setProfile(defaultProfile)
    setAccounts([])
    setLoadError(null)
    setRefreshError(null)
    setIsRefreshing(false)
    setLoadState(userId ? 'loading' : 'ready')
  }

  useLayoutEffect(() => {
    activeIdentity.current = identity
    return () => {
      activeIdentity.current = null
      sequence.current++
      profileSequence.current++
      hasLoaded.current = false
      staleSyncTriggered.current.clear()
      staleInvestmentSyncTriggered.current.clear()
    }
  }, [identity])

  const invalidateReports = useCallback(()=>setReportRevision(n=>n+1),[])
  // Identity edits do not invalidate financial scopes. A separate generation
  // also prevents an older all-data refresh from overwriting the new callsign.
  const refreshProfile = useCallback(async()=>{
    if (!identity.userId || activeIdentity.current !== identity) return
    const generation = ++profileSequence.current
    const {data,error} = await supabase.from('profiles').select('callsign').eq('id',identity.userId).maybeSingle()
    if (activeIdentity.current !== identity || generation !== profileSequence.current) return
    if (error) throw error
    setProfile({callsign:data?.callsign || 'Operator'})
  },[identity])

  const refreshData = useCallback(async function refreshData() {
    const { userId, tenantId } = identity
    if (!userId || !tenantId || activeIdentity.current !== identity) return
    invalidateReports()
    const profileGeneration = ++profileSequence.current
    const generation = ++sequence.current
    const isCurrent = () => activeIdentity.current === identity && generation === sequence.current
    const background = hasLoaded.current
    if (background) {
      setIsRefreshing(true)
      setRefreshError(null)
    } else {
      setLoadState('loading')
      setLoadError(null)
    }
    try {
      // RLS is the boundary; tenant equality additionally selects the active
      // scope for users who belong to more than one tenant.
      const [profileRes, fetchedAccounts, fetchedConnections] = await Promise.all([
        supabase.from('profiles').select('callsign').eq('id',userId).maybeSingle(),
        readAccounts(tenantId),
        readAccountConnections(tenantId),
      ])
      if (!isCurrent()) return
      if (profileRes.error) throw profileRes.error
      const fetchedProfile = profileRes.data
      const connectionByAccountId = new Map(fetchedConnections.map(c => [c.account_id, c]))
      // Fire-and-forget: a stale connection gets synced in the background,
      // not blocking this render. sync-provider's own concurrency lock and
      // rate limit make a redundant call harmless if two tabs both trigger it.
      const staleConnectionIds = new Set(
        fetchedConnections
          .filter((c) => {
            const status = (c as unknown as { provider_connections: { status: string } | null }).provider_connections?.status
            if (status !== 'active') return false
            if (staleSyncTriggered.current.has(c.connection_id)) return false
            const staleness = c.balance_as_of ? Date.now() - new Date(c.balance_as_of).getTime() : Infinity
            return staleness > STALE_SYNC_MS
          })
          .map((c) => c.connection_id),
      )
      for (const connectionId of staleConnectionIds) {
        staleSyncTriggered.current.add(connectionId)
        void supabase.functions
          .invoke('sync-provider', { body: { connection_id: connectionId, trigger: 'stale' } })
          .catch(() => {})
      }


      // Map DB accounts to UI Accounts
      const mappedAccounts: Account[] = fetchedAccounts.map((a) => {
        const connection = connectionByAccountId.get(a.id)
        const institution = connection?.provider === 'up' ? 'Up Bank' : undefined
        return {
          id: a.id,
          name: a.name,
          type: a.type,
          balance: a.balance,
          glow: a.balance < 0 ? 'red' : 'cyan',
          balanceSource: a.balance_source,
          balanceAsOf: a.balance_as_of,
          institution,
          accountConnectionId: connection?.id,
          providerConnectionId: connection?.connection_id,
          cutoverDate: connection?.cutover_date,
          lastSyncedAt: connection?.balance_as_of ?? undefined,
        }
      })

      // Managed-fund NAV is end-of-day rather than intraday. Refresh an
      // investment account at most once per session when its verified price
      // is older than 30 hours; the provider adapter itself is idempotent and
      // fetches once per instrument, not once per holding.
      for (const account of mappedAccounts) {
        if (account.balanceSource !== 'investment_valuation' || staleInvestmentSyncTriggered.current.has(account.id)) continue
        const age = account.balanceAsOf ? Date.now() - new Date(account.balanceAsOf).getTime() : Infinity
        if (age <= STALE_INVESTMENT_SYNC_MS) continue
        staleInvestmentSyncTriggered.current.add(account.id)
        void supabase.functions.invoke('sync-investment-prices', {
          body: { account_id: account.id, trigger: 'stale' },
        }).then(({ error }) => {
          if (!error && isCurrent()) void refreshData()
        }).catch(() => {})
      }
      setAccounts(mappedAccounts)
      if (profileGeneration === profileSequence.current) setProfile({ callsign: fetchedProfile?.callsign || 'Operator' })
      setLoadState('ready')
      setLoadError(null)
      setRefreshError(null)
      hasLoaded.current = true
    } catch (error) {
      if (!isCurrent()) return
      console.error('Error fetching data:', error)
      const message = 'We couldn\'t load your financial data. Check your connection and try again.'
      if (background) setRefreshError(message)
      else {
        setLoadError(message)
        setLoadState('error')
      }
    } finally {
      if (background && isCurrent()) setIsRefreshing(false)
    }
  }, [identity, invalidateReports])

  // Keyed on user and active tenant rather than the session object: a token refresh
  // produces a new session every 15 minutes with the same user, and refetching
  // the whole dataset on each one would be pure churn.
  useEffect(() => {
    void refreshData()
  }, [refreshData])

  return (
    <DataContext.Provider value={{ reportRevision, loadState, loadError, isRefreshing, refreshError, profile, isAdmin, accounts, refreshData, refreshProfile, invalidateReports }}>
      {children}
    </DataContext.Provider>
  )
}
