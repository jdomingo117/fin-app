import { useMemo, useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { Screen, ViewHeader, Grid } from '../components/Screen'
import TransactionsPanel from '../components/TransactionsPanel'
import ExpenseTrendCard from '../components/ExpenseTrendCard'
import ExpenseFlowCard from '../components/ExpenseFlowCard'
import ExpenseChangesCard from '../components/ExpenseChangesCard'

import ExpenseScopeBar from '../components/ExpenseScopeBar'
import SegmentedTabs from '../components/SegmentedTabs'
import HeroMetric from '../components/HeroMetric'
import AnalyzerFilters from '../components/AnalyzerFilters'
import RecurringHub from '../components/RecurringHub'
import { usePeriodRange } from '../hooks/usePeriodRange'
import { inclusiveDayCount } from '../lib/period'
import { expenseMetricValues } from '../lib/expenseMetrics'
import { isGrossExpense } from '../lib/classification'
import { shortMerchant } from '../lib/recurring'
import {
  EMPTY_SELECTION,
  isActive,
  pruneSubcats,
  selectionLabel,
  toggleCategory,
  toggleSubcat,
  type CatSelection,
} from '../lib/expenseSelection'
import { fmt } from '../data'
import {cashFlow, type FlowParams} from '../lib/reports'
import {useReport} from '../hooks/useReport'
import ReportStatus from '../components/ReportStatus'
import { useData } from '../contexts/DataContext'

/** Vendor names carry a `Primary // Detail` form; the hero card shows the
 *  primary so long names don't overflow. */

const TABS = [
  { id: 'analytics', label: 'Analytics' },
  { id: 'recurring', label: 'Recurring hub' },
]

export default function Expenses() {
  const [view, setView] = useState('analytics')
  const { preset, from, to, applyPreset, changeFrom, changeTo } = usePeriodRange()
  const { accounts: dbAccounts } = useData()
  const location = useLocation()
  const dashboardFocus = location.state as { source?: string; category?: string; from?: string; to?: string } | null

  const OUTFLOW_ACCOUNTS = useMemo(() => {
    if (!dbAccounts || dbAccounts.length === 0) return []
    return dbAccounts.map(a => ({ id: a.id, name: a.name, share: 1 / dbAccounts.length }))
  }, [dbAccounts])

  const ACCOUNT_OPTIONS = useMemo(() => OUTFLOW_ACCOUNTS.map((a) => ({
    value: a.id,
    label: a.name,
    hint: '',
  })), [OUTFLOW_ACCOUNTS])

  const [accounts, setAccounts] = useState<string[]>([])
  
  // Set default selected accounts once dbAccounts loads
  useEffect(() => {
    if (dbAccounts.length > 0 && accounts.length === 0) {
      setAccounts(dbAccounts.map(a => a.id))
    }
  }, [dbAccounts])

  // Dashboard insight links carry an intentional, one-off investigation
  // context. Apply it only for this history entry; changing the filter bar
  // afterward remains wholly under the person's control.
  useEffect(() => {
    if (dashboardFocus?.source !== 'dashboard-insight') return
    if (dashboardFocus.from) changeFrom(dashboardFocus.from)
    if (dashboardFocus.to) changeTo(dashboardFocus.to)
  // `location.key` identifies a new navigation entry. The range setters are
  // intentionally excluded: this must not reapply the focus after user edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  return (
    <Screen>
      {/* Header — title + primary view switch (row 1), then an analytics-only
          filter bar (row 2). Elevated z-index so the popovers overlay content. */}
      <div className="relative z-30 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <ViewHeader index="04 — Outflow" title="Expenses" sub="Cash flow, ledger & budget capacity" />
          <div className="pt-1.5">
            <SegmentedTabs tabs={TABS} active={view} onChange={setView} layoutId="expenses-tabs" />
          </div>
        </div>

        {view === 'analytics' && (
          <AnalyzerFilters
            preset={preset}
            from={from}
            to={to}
            onPreset={applyPreset}
            onFrom={changeFrom}
            onTo={changeTo}
            accounts={accounts}
            accountOptions={ACCOUNT_OPTIONS}
            onAccounts={setAccounts}
            rangeLayoutId="expenses-range"
          />
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {view === 'analytics' ? (
          <motion.div
            key="analytics"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <ExpenseAnalytics
              from={from}
              to={to}
              accounts={accounts}
              initialCategory={dashboardFocus?.source === 'dashboard-insight' ? dashboardFocus.category ?? null : null}
              navigationKey={location.key}
            />
          </motion.div>
        ) : (
          <motion.div
            key="recurring"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <RecurringHub />
          </motion.div>
        )}
      </AnimatePresence>
    </Screen>
  )
}

/* ── Expense analytics ───────────────────────────────────────────────────
   Header toolbar (period range · spending accounts) drives the cash-flow
   comparison and the outflow ledger; budget capacity is cycle-based.

   A single category focus (`sel`) is shared across the tiles. The two
   comparison tiles (flow · changes) are its *sources* and never filter
   themselves — they highlight, because filtering a part-to-whole view down to
   one part deletes the comparison that is the question. Everything that answers
   "how much / which ones?" (hero · trend · ledger) follows the focus. */

function ExpenseAnalytics({
  from,
  to,
  accounts,
  initialCategory,
  navigationKey,
}: {
  from: string
  to: string
  accounts: string[]
  initialCategory: string | null
  navigationKey: string
}) {
  const [sel, setSel] = useState<CatSelection>(EMPTY_SELECTION)
  const [timeFocus, setTimeFocus] = useState<{ from: string; to: string; label: string } | null>(null)
  const [changesExpanded, setChangesExpanded] = useState(false)
  const changesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initialCategory) setSel({ categories: [initialCategory], subcats: [] })
  }, [initialCategory, navigationKey])

  // Reset timeFocus if the base date range changes
  useEffect(() => {
    setTimeFocus(null)
    setChangesExpanded(false)
  }, [from, to])

  useEffect(() => {
    setChangesExpanded(false)
  }, [timeFocus?.from, timeFocus?.to])

  useEffect(() => {
    setChangesExpanded(false)
  }, [accounts])

  const showDetailedChanges = () => {
    setChangesExpanded(true)
    window.requestAnimationFrame(() => changesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const {reportingTransactions:transactions} = useData()
  const activeFrom = timeFocus?.from ?? from
  const activeTo = timeFocus?.to ?? to
  const len = inclusiveDayCount(from,to)
  const bucket = len <= 45 ? 'day' : len <= 130 ? 'week' : 'month'
  const params:FlowParams = {p_from:from,p_to:to,p_account_ids:accounts,p_bucket:bucket,
    p_categories:sel.categories,p_subcategories:sel.subcats,p_focus_from:activeFrom,p_focus_to:activeTo}
  const report = useReport(params,tenant=>cashFlow(tenant,params),accounts.length>0 && activeFrom>=from && activeTo<=to)
  // The transaction drill-down still uses the provider until Wave 3C.3.
  const drillRows = useMemo(()=>transactions.filter(t=>isGrossExpense(t) && !t.isTransfer &&
    accounts.includes(t.account_id) && t.date>=activeFrom && t.date<=activeTo),[transactions,accounts,activeFrom,activeTo])
  const current = report.data?.categories.filter(f=>f.period==='current' && f.gross_cents>0) ?? []
  const prior = report.data?.categories.filter(f=>f.period==='prior' && f.gross_cents>0) ?? []
  const totals = new Map<string,number>()
  for (const f of current) totals.set(f.category,(totals.get(f.category) ?? 0)+f.gross_cents)
  const [name,amount] = [...totals].sort((a,b)=>b[1]-a[1])[0] ?? ['—',0]
  const total = report.data?.periods.current.gross_cents ?? 0
  const prevTotal = report.data?.periods.prior.gross_cents ?? 0
  const periodTotal = current.reduce((sum,f)=>sum+f.gross_cents,0)
  const metrics = expenseMetricValues(total,prevTotal,activeFrom,activeTo)
  const merchant = report.data?.top_merchant
  const m = {total,prevTotal,periodTotal,periodShare:periodTotal ? total/periodTotal : 0,
    topCat:{name,total:amount},topCatShare:total ? amount/total : 0,
    topMerch:{name:merchant?.merchant ?? '—',total:merchant?.gross_cents ?? 0},
    dailyAvg:metrics.dailyAverage,lenDays:metrics.lenDays,deltaPct:metrics.deltaPct}
  const focused = isActive(sel)
  const focusLabel = selectionLabel(sel)

  /* Every mutation routes through the helpers so `subcats ⊆ union(TAXONOMY[categories])`
     can't be violated — an impossible pair matches zero rows with no explanation. */
  const setCategories = (next: string[]) =>
    setSel((s) => ({ categories: next, subcats: pruneSubcats(next, s.subcats, current.map(f=>({cat:f.category,subcat:f.subcategory ?? undefined}))) }))
  const setSubcats = (next: string[]) => setSel((s) => ({ ...s, subcats: next }))
  const onToggleCategory = (cat: string) => setSel((s) => toggleCategory(s, cat))
  const onToggleSubcat = (cat: string, sub: string) => setSel((s) => toggleSubcat(s, cat, sub))

  // Spending semantics: an increase reads unfavourable (red ▲), a decrease favourable (green ▼).
  const deltaTone = m.deltaPct == null || m.deltaPct === 0 ? 'muted' : m.deltaPct > 0 ? 'neg' : 'pos'
  const deltaText =
    m.deltaPct == null
      ? null
      : `${m.deltaPct > 0 ? '▲' : m.deltaPct < 0 ? '▼' : '±'} ${Math.abs(Math.round(m.deltaPct * 100))}% vs prev`

  if (accounts.length === 0) {
    return (
      <Grid>
        <div className="md:col-span-2 xl:col-span-3 py-16 text-center border border-[var(--hair-soft)] bg-[var(--hair-soft)] rounded-xl px-6 flex flex-col items-center gap-3">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--color-warn)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="12" x="2" y="6" rx="2" />
            <circle cx="12" cy="12" r="2" />
            <path d="M6 12h.01M18 12h.01" />
          </svg>
          <div className="font-display text-[16px] font-bold text-ink">No spending accounts selected</div>
          <p className="max-w-[440px] body-copy">
            Please select at least one outflow account from the filter bar above to analyze transaction history, category changes, and category outflow.
          </p>
        </div>
      </Grid>
    )
  }

  if (!report.data) return <ReportStatus report={report} label="Expense report" />
  return (
    <Grid>
      <ReportStatus report={report} label="Expense report" />
      <ExpenseScopeBar
        selection={sel}
        label={focusLabel}
        onClear={() => setSel(EMPTY_SELECTION)}
        timeFocus={timeFocus}
        onClearTimeFocus={() => setTimeFocus(null)}
      />

      {/* Row 1 — period KPI hero cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:col-span-2 xl:col-span-3 xl:grid-cols-4">
        <HeroMetric
          label={focused ? `${focusLabel} outflow` : 'Outflow period total'}
          value={fmt(m.total)}
          sub={deltaText ? `${deltaText} · was ${fmt(m.prevTotal)}` : 'no prior period'}
          tone={deltaTone}
        />
        <HeroMetric
          label="Daily average outflow"
          value={fmt(m.dailyAvg)}
          sub={deltaText ? `${deltaText} · ${m.lenDays} days` : `over ${m.lenDays} days`}
          tone={deltaTone}
        />
        {/* Under a focus "heavyweight category" is trivially the focused one, so the
            card swaps to the share of the whole — non-degenerate at any depth, and
            it re-links this row to the totals the comparison tiles still show.
            Keyed so the label and value transition together. */}
        {focused ? (
          <HeroMetric
            key="share"
            label="Share of outflow"
            value={`${Math.round(m.periodShare * 100)}%`}
            sub={m.total > 0 ? `${fmt(m.total)} of ${fmt(m.periodTotal)} period outflow` : 'no spending'}
          />
        ) : (
          <HeroMetric
            key="heavyweight"
            label="Heavyweight category"
            value={m.topCat.name}
            valueClass="truncate"
            sub={m.topCat.total > 0 ? `${fmt(m.topCat.total)} · ${Math.round(m.topCatShare * 100)}% of outflow` : 'no spending'}
          />
        )}
        <HeroMetric
          label="Top vendor"
          value={shortMerchant(m.topMerch.name)}
          valueClass="truncate"
          sub={
            m.topMerch.total > 0
              ? `${fmt(m.topMerch.total)} · highest ${focused ? `in ${focusLabel}` : 'cost'}`
              : 'no vendors'
          }
        />
      </div>

      {/* Row 2 — a deliberately asymmetric analytics composition. The flow keeps
          its readable height on the right; trend + a concise change summary fill
          the left rail, avoiding a stretched chart or a blank area. */}
      <div className="grid grid-cols-1 gap-3.5 md:col-span-2 xl:col-span-3 xl:grid-cols-[1fr_1.13fr] xl:items-stretch">
        <div className="flex h-full flex-col gap-3.5">
          <ExpenseTrendCard
            buckets={report.data.buckets}
            bucket={bucket}
            from={from}
            to={to}
            scopeLabel={focused ? focusLabel : undefined}
            timeFocus={timeFocus}
            onTimeFocus={setTimeFocus}
            height={420}
          />
          <ExpenseChangesCard
            variant="summary"
            outflows={current}
            previousOutflows={prior}
            selection={sel}
            onToggleCategory={onToggleCategory}
            onViewDetail={showDetailedChanges}
          />
        </div>
        {/* a selection source: takes the unfiltered set and highlights */}
        <ExpenseFlowCard
          outflows={current}
          selection={sel}
          onToggleCategory={onToggleCategory}
          onToggleSubcat={onToggleSubcat}

        />
      </div>
      {/* Row 3 — a direct current-versus-prior category comparison. It is a
          selection source, but deliberately never filters itself. */}
      <div ref={changesRef} className="md:col-span-2 xl:col-span-3">
        <ExpenseChangesCard
          outflows={current}
          previousOutflows={prior}
          selection={sel}
          onToggleCategory={onToggleCategory}
          expanded={changesExpanded}
          onExpandedChange={setChangesExpanded}
        />
      </div>
      {/* Row 4 — transactions. `rows` stays UNFILTERED: this panel is the filterer,
          it just sources its category state from the shared focus now. Pre-filtering
          would zero out the popover's per-category counts. */}
      <TransactionsPanel
        rows={drillRows}
        categories={sel.categories}
        subcats={sel.subcats}
        onCategories={setCategories}
        onSubcats={setSubcats}
      />
    </Grid>
  )
}
