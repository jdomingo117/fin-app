import {mapParent} from '../lib/reportParent'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Account, Txn, Achievement, TransactionAllocation } from '../data'
import type { RecurrenceHint, RecurringSeriesOverride } from '../lib/recurring'
import { useAuth } from './AuthContext'
import { expandTransactionAllocations } from '../lib/allocations'

export type ProfileData = {
  callsign: string
}

interface Budget {
  id: string
  category: string
  amount_limit: number
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
  transactions: Txn[]
  reportingTransactions: Txn[]
  achievements: Achievement[]
  budgets: Budget[]
  recurrenceHints: Map<string, RecurrenceHint>
  recurrenceOverrides: RecurringSeriesOverride[]
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
  transactions: [],
  reportingTransactions: [],
  achievements: [],
  budgets: [],
  recurrenceHints: new Map(),
  recurrenceOverrides: [],
  refreshData: async () => {},
})

export const useData = () => useContext(DataContext)

export function DataProvider({ children }: { children: ReactNode }) {
  const { session, isAdmin } = useAuth()
  const userId = session?.user.id ?? null
  const [identity, setIdentity] = useState({ userId })
  const activeIdentity = useRef<typeof identity | null>(identity)
  const [reportRevision, setReportRevision] = useState(0)
  const sequence = useRef(0)
  const [loadState, setLoadState] = useState<DataCtx['loadState']>(userId ? 'loading' : 'ready')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileData>(defaultProfile)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Txn[]>([])
  const [reportingTransactions, setReportingTransactions] = useState<Txn[]>([])
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [recurrenceHints, setRecurrenceHints] = useState<Map<string, RecurrenceHint>>(new Map())
  const [recurrenceOverrides, setRecurrenceOverrides] = useState<RecurringSeriesOverride[]>([])
  // Connection ids already given a stale-sync this session — refreshData()
  // runs after nearly every mutation, and without this a single session
  // would fire the same background sync repeatedly instead of once.
  const staleSyncTriggered = useRef(new Set<string>())
  const staleInvestmentSyncTriggered = useRef(new Set<string>())
  const hasLoaded = useRef(false)

  // React retries this render before rendering descendants, so consumers
  // never see the previous user's data with the new session.
  if (identity.userId !== userId) {
    setIdentity({ userId })
    setProfile(defaultProfile)
    setAccounts([])
    setTransactions([])
    setReportingTransactions([])
    setAchievements([])
    setBudgets([])
    setRecurrenceHints(new Map())
    setRecurrenceOverrides([])
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
      hasLoaded.current = false
      staleSyncTriggered.current.clear()
      staleInvestmentSyncTriggered.current.clear()
    }
  }, [identity])

  const refreshData = useCallback(async function refreshData() {
    const { userId } = identity
    if (!userId || activeIdentity.current !== identity) return
    setReportRevision(n => n + 1)
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
      // The explicit .eq('user_id', ...) filters that used to sit on these
      // queries are gone: membership-based RLS now scopes every row to the
      // caller's tenant server-side. Client-side filters were never the
      // boundary, and keeping them implied otherwise — the pattern quietly
      // invites "just one query without the filter" to become a leak.
      //
      // The getUser() round-trip that used to guard this block is also gone;
      // RequireAuth already gates every route that mounts this provider, and
      // an invalid token now fails the queries themselves.
      const [profileRes, accountsRes, txnsRes, achievementsRes, userAchievementsRes, budgetsRes, accountConnectionsRes, recurrenceHintsRes, recurrenceOverridesRes, allocationsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('accounts').select('*'),
        supabase.from('transactions_analytic').select('*').order('date', { ascending: false }),
        supabase.from('achievements').select('*'),
        supabase.from('user_achievements').select('*').eq('user_id', userId),
        supabase.from('budgets').select('*'),
        supabase.from('account_connections').select('id, account_id, connection_id, provider, cutover_date, balance_as_of, provider_connections(status)'),
        supabase.from('merchant_recurrence_hints').select('merchant_key, is_recurring, suggested_cadence, confidence'),
        supabase.from('recurring_series_overrides').select('id,merchant_key,account_id,state,cadence_override,expected_amount_override,next_expected_override,reminder_days_before'),
        supabase.from('transaction_allocations').select('id,transaction_id,position,amount,kind,category,subcategory,note').order('position'),
      ])
      if (!isCurrent()) return

      const requiredError = [profileRes, accountsRes, txnsRes].find((result) => result.error)?.error
      if (requiredError) throw requiredError

      const optionalResults = [achievementsRes, userAchievementsRes, budgetsRes, accountConnectionsRes, recurrenceHintsRes, recurrenceOverridesRes, allocationsRes]
      for (const result of optionalResults) {
        if (result.error) console.warn('Optional data enrichment failed:', result.error.message)
      }

      const fetchedAccounts = accountsRes.data ?? []
      const fetchedTxns = txnsRes.data ?? []
      const fetchedProfile = profileRes.data
      const fetchedConnections = accountConnectionsRes.data || []
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
      const accountNameById = new Map(mappedAccounts.map((account) => [account.id, account.name]))

      // Map DB transactions to UI Txn
      const mappedTxns = fetchedTxns.map(t=>mapParent(t,accountNameById.get(t.account_id) ?? 'Unknown'))

      const allocationsByTransaction = new Map<string, TransactionAllocation[]>()
      for (const row of allocationsRes.data ?? []) {
        const allocation: TransactionAllocation = {
          id: row.id, position: row.position, amount: row.amount, kind: row.kind,
          category: row.category, subcategory: row.subcategory ?? undefined, note: row.note ?? undefined,
        }
        const items = allocationsByTransaction.get(row.transaction_id) ?? []
        items.push(allocation); allocationsByTransaction.set(row.transaction_id, items)
      }
      const withAllocations = mappedTxns.map((transaction) => ({ ...transaction, allocations: allocationsByTransaction.get(transaction.id) ?? [] }))
      const expanded = expandTransactionAllocations(withAllocations)

      setAccounts(mappedAccounts)
      setTransactions(withAllocations)
      setReportingTransactions(expanded)
      const allAchievements = achievementsRes.data || []
      const userUnlockIds = new Set((userAchievementsRes.data || []).map(ua => ua.achievement_id))
      const unlockedAchievements = allAchievements.filter(a => userUnlockIds.has(a.id))
      setAchievements(unlockedAchievements)
      
      setBudgets(budgetsRes.data || [])

      setRecurrenceHints(new Map(
        (recurrenceHintsRes.data || []).map((h) => [
          h.merchant_key,
          {
            isRecurring: h.is_recurring,
            suggestedCadence: h.suggested_cadence as RecurrenceHint['suggestedCadence'],
            confidence: h.confidence,
          },
        ]),
      ))
      setRecurrenceOverrides((recurrenceOverridesRes.data || []).map((override) => ({
        id: override.id,
        merchantKey: override.merchant_key,
        accountId: override.account_id,
        state: override.state as RecurringSeriesOverride['state'],
        cadenceOverride: override.cadence_override as RecurringSeriesOverride['cadenceOverride'],
        expectedAmountOverride: override.expected_amount_override,
        nextExpectedOverride: override.next_expected_override,
        reminderDaysBefore: override.reminder_days_before,
      })))
      setProfile({ callsign: fetchedProfile?.callsign || 'Operator' })
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
  }, [identity])

  // Keyed on the user id rather than the session object: a token refresh
  // produces a new session every 15 minutes with the same user, and refetching
  // the whole dataset on each one would be pure churn.
  useEffect(() => {
    void refreshData()
  }, [refreshData])

  return (
    <DataContext.Provider value={{ reportRevision, loadState, loadError, isRefreshing, refreshError, profile, isAdmin, accounts, transactions, reportingTransactions, achievements, budgets, recurrenceHints, recurrenceOverrides, refreshData }}>
      {children}
    </DataContext.Provider>
  )
}
