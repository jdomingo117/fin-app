import { RECENT_ACTIVITY_COUNT, dashboardWindow, useCachedDashboardReports, useDashboardReports } from '../components/console/DashboardReports'
import {reportParent} from '../lib/reportParent'
import { FocusRow } from '../components/console/FocusRow'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import ConsoleHome from '../components/console/ConsoleHome'
import ConsoleHub, { ConsoleChartValues, ConsoleModule, cumulativeValues, type ConsoleArt, type ConsoleFigure } from '../components/console/ConsoleHub'
import { DateRangePicker, MultiSelect } from '../components/Controls'
import { usePeriodRange } from '../hooks/usePeriodRange'
import type { ConsoleOutlet } from '../components/console/ConsoleViewport'
import { expenseEffectCents, isEarnedIncome } from '../lib/classification'
import HeroCard from '../components/HeroCard'
import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import AllocationDonut from '../components/AllocationDonut'
import Ledger from '../components/Ledger'
import TransactionCategoryDrawer from '../components/TransactionCategoryDrawer'
import Area from '../components/charts/Area'
import Bar from '../components/charts/Bar'
import { fmt, fmtCents, glowColor, type Glow } from '../data'
import { useData } from '../contexts/DataContext'
import { useReport } from '../hooks/useReport'
import ReportStatus from '../components/ReportStatus'
import { useView } from '../router'
import { dateRangeLabel, fullDayLabel, MAX_DATE, MIN_DATE, monthAxisLabels, monthLabel, PRESETS } from '../lib/period'

function getAccountIcon(type: string, name: string) {
  const t = type.toLowerCase()
  const n = name.toLowerCase()

  if (n.includes('car') || n.includes('auto') || n.includes('vehicle')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
        <circle cx="7" cy="17" r="2" />
        <circle cx="17" cy="17" r="2" />
      </svg>
    )
  }
  if (t === 'debt' || n.includes('credit') || n.includes('card')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <rect width="20" height="14" x="2" y="5" rx="2" />
        <line x1="2" x2="22" y1="10" y2="10" />
        <line x1="6" x2="10" y1="14" y2="14" />
      </svg>
    )
  }
  if (t === 'invest' || n.includes('ira') || n.includes('fund') || n.includes('vtsax')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="m3 16 4-4 4 4 9-9" />
        <path d="M16 7h4v4" />
      </svg>
    )
  }
  if (t === 'savings' || n.includes('reserve') || n.includes('yield')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  )
}

export default function Dashboard() {
  const { accounts, refreshData } = useData()
  const { go, toast, theme } = useView()
  const consoleRoute = useOutletContext<ConsoleOutlet | null>()
  const navigate = useNavigate()
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null)
  const parent = useReport(selectedTransactionId,tenant=>reportParent(tenant,selectedTransactionId!,accounts),!!selectedTransactionId)


  const refreshAfterTransactionEdit = async () => {
    await refreshData()
    toast({ title: 'Transaction updated', sub: 'Dashboard activity has been refreshed.' })
  }
  
  const { today, from: thirtyDaysAgoIso } = dashboardWindow()
  const consoleOverview = theme === 'console' && !!consoleRoute && !consoleRoute.home
  const overviewRange = usePeriodRange(undefined, { from: thirtyDaysAgoIso, to: today })
  const [insightAccounts, setInsightAccounts] = useState<string[] | null>(null)
  const flowFrom = consoleOverview ? overviewRange.from : thirtyDaysAgoIso
  const flowTo = consoleOverview ? overviewRange.to : today
  const accountScope = consoleOverview ? insightAccounts ?? undefined : undefined
  const cached = useCachedDashboardReports()
  const scopedFlow = flowFrom !== thirtyDaysAgoIso || flowTo !== today || accountScope !== undefined
  const local = useDashboardReports(flowFrom, flowTo, accountScope, !cached, !cached || scopedFlow)
  const { summary, activity, history } = cached ?? local
  const flow = cached && !scopedFlow ? cached.flow : local.flow
  useEffect(() => {
    if (consoleRoute?.home) void import('./Income')
  }, [consoleRoute?.home])
  const [chartType, setChartType] = useState<'line' | 'bar'>('line')
  const drawer = <>
    {selectedTransactionId && <ReportStatus report={parent} label="Transaction details" />}
    <TransactionCategoryDrawer
      transaction={parent.data}
      onClose={() => setSelectedTransactionId(null)}
      onChanged={refreshAfterTransactionEdit}
    />
  </>
  if (theme === 'console' && consoleRoute?.home) {
    const { active, select, restoreFocus } = consoleRoute
    const flowPeriod = active === 'income' || active === 'expenses'
    const cash = summary.data?.cash_asset_cents ?? 0
    const investments = summary.data?.investment_asset_cents ?? 0
    const previewFigures: Partial<Record<typeof active, ConsoleFigure[]>> = {
      dashboard: [
        { label: 'Net worth', cents: summary.data?.net_worth_cents },
        { label: '30-day net movement', cents: summary.data?.net_movement_30d_cents, signed: true },
      ],
      accounts: [
        { label: 'Cash assets', cents: summary.data?.cash_asset_cents },
        { label: 'Investment assets', cents: summary.data?.investment_asset_cents },
      ],
      income: [{ label: 'Inflow', cents: flow.data?.periods.current.earned_cents }],
      expenses: [{ label: 'Net spending', cents: flow.data?.periods.current.expense_cents }],
    }
    const previewArt: Partial<Record<typeof active, ConsoleArt>> = {
      dashboard: { label: 'Monthly net worth', values: history.data?.map(point => point.value) ?? [] },
      ...(cash + investments > 0 ? { accounts: { label: 'Cash share of assets', percent: Math.round(cash / (cash + investments) * 100) } } : {}),
      income: { label: 'Cumulative inflow for this period', values: cumulativeValues(flow.data?.buckets.map(point => point.earned_cents) ?? []) },
      expenses: { label: 'Cumulative gross outflow for this period', values: cumulativeValues(flow.data?.buckets.map(point => point.gross_cents) ?? []) },
    }
    const latestDate = activity.data?.[0]?.date
    const cards = activity.data?.filter(transaction => {
      if (!flowPeriod) return active === 'dashboard'
      if (transaction.date < thirtyDaysAgoIso || transaction.date > today || transaction.isTransfer) return false
      return active === 'income' ? isEarnedIncome(transaction) : expenseEffectCents(transaction) !== 0
    })
    return <>
      <ConsoleHome
        activeId={active}
        selectSection={select}
        restoreFocus={restoreFocus}
        covered={!!selectedTransactionId}
        activity={cards}
        accounts={accounts}
        period={dateRangeLabel(thirtyDaysAgoIso, today, true)}
        latestDate={latestDate ? fullDayLabel(latestDate) : undefined}
        openTransaction={transaction => setSelectedTransactionId(transaction.parentTransactionId ?? transaction.id)}
        figures={previewFigures}
        trends={previewArt}
        open={section => {
          consoleRoute.begin({ id: section, headline: previewFigures[section]?.[0], art: previewArt[section] })
          if (section === 'dashboard') {
            navigate('/dashboard?hub=overview')
          } else if (section === 'expenses') {
            go(section, { state: { source: 'dashboard-insight', from: thirtyDaysAgoIso, to: today } })
          } else {
            go(section)
          }
        }}
      />
      {drawer}
    </>
  }
  const header = <ViewHeader index="01 — Command" title="Dashboard" sub="Your finances at a glance" />
  if ((!summary.data || !flow.data) && !consoleOverview) return <Screen>{header}
    <ReportStatus report={summary} label="Portfolio" /><ReportStatus report={flow} label="Cash flow" /></Screen>
  const inc = flow.data?.periods.current.earned_cents ?? 0
  const spend = flow.data?.periods.current.expense_cents ?? 0
  const savings = inc === 0 ? 0 : Math.round(((inc - spend) / inc) * 100)
  const percentOfInflow = inc === 0 ? 0 : Math.round((spend / inc) * 100)

  const priorInc = flow.data?.periods.prior.earned_cents ?? 0
  const priorSpend = flow.data?.periods.prior.expense_cents ?? 0
  const incChangePct = priorInc === 0 ? 0 : Math.round(((inc - priorInc) / priorInc) * 1000) / 10
  const spendChangePct = priorSpend === 0 ? 0 : Math.round(((spend - priorSpend) / priorSpend) * 1000) / 10
  
  const liquidSum = summary.data?.cash_asset_cents ?? 0
  const investSum = summary.data?.investment_asset_cents ?? 0

  const allocation = []
  if (investSum > 0) allocation.push({ label: 'Investments', value: investSum, glow: 'green' as Glow })
  if (liquidSum > 0) allocation.push({ label: 'Cash', value: liquidSum, glow: 'cyan' as Glow })
  if (allocation.length === 0) {
    allocation.push({ label: 'Cash', value: 0, glow: 'cyan' as Glow })
  }

  // Spending insights use settled, real outflows only.  Unlike the old
  // capacity tile, they don't invent a budget baseline when the person has
  // not actually configured one.
  const catSpending: Record<string, number> = Object.create(null)
  const priorCatSpending: Record<string, number> = Object.create(null)
  for (const facet of flow.data?.categories ?? []) {
    if (!facet.gross_cents) continue
    const totals = facet.period === 'current' ? catSpending : priorCatSpending
    totals[facet.category] = (totals[facet.category] ?? 0) + facet.gross_cents
  }
  const rankedCategories = Object.entries(catSpending)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
  const topCategory = rankedCategories[0] ?? null
  const topCategoryShare = spend > 0 && topCategory ? Math.round((topCategory.amount / spend) * 100) : 0

  const largestCategoryChange = Array.from(new Set([...Object.keys(catSpending), ...Object.keys(priorCatSpending)]))
    .map((category) => ({
      category,
      amount: catSpending[category] ?? 0,
      delta: (catSpending[category] ?? 0) - (priorCatSpending[category] ?? 0),
    }))
    .filter((change) => change.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] ?? null
  const reviewCount = flow.data?.periods.current.expense_attention_count ?? 0
  const currentNetWorth = summary.data?.net_worth_cents ?? (consoleRoute?.entry?.id === 'dashboard' ? consoleRoute.entry.headline?.cents : undefined)
  const netWorthTrend = history.data?.map(point=>point.value) ?? []
  const netWorthMonths = history.data?.map(point => point.month) ?? []
  const netWorthLabels = consoleOverview ? monthAxisLabels(netWorthMonths) : netWorthMonths.map(month => month.slice(0, 7))
  const previous = netWorthTrend.at(-2)
  const netWorthMonthChangePct = previous && currentNetWorth !== undefined ? Math.round((currentNetWorth-previous)/Math.abs(previous)*1000)/10 : undefined

  const spendingInsights = <SpendingInsights
    topCategory={topCategory}
    topCategoryShare={topCategoryShare}
    largestCategoryChange={largestCategoryChange}
    savings={savings}
    income={inc}
    reviewCount={reviewCount}
    onExploreExpenses={() => go('expenses', { state: { source: 'dashboard-insight', from: flowFrom, to: flowTo } })}
    onExploreCategory={category => go('expenses', { state: { source: 'dashboard-insight', category, from: flowFrom, to: flowTo } })}
    onReviewLedger={() => go('ledger', { state: { source: 'dashboard-insight', review: 'needs-review' } })}
    onExploreIncome={() => go('income')}
    period={consoleOverview ? dateRangeLabel(flowFrom, flowTo) : undefined}
  />
  const recent = <>
    <ReportStatus report={activity} label="Recent activity" />
    {activity.data && (activity.data.length > 0 ? <Ledger consoleStyle={consoleOverview} rows={activity.data} onEdit={transaction => setSelectedTransactionId(transaction.parentTransactionId ?? transaction.id)} /> : (
      <div className="py-10 text-center"><p className="body-copy">No transactions yet.</p>
        <button type="button" onClick={() => go('ingestion')} className="mt-3 text-[13px] font-semibold text-accent hover:opacity-80">Import a statement</button>
      </div>
    ))}
  </>

  if (consoleOverview && consoleRoute) {
    const chartSeries = [{ label: 'Net worth', data: netWorthTrend, color: 'var(--console-chart-ink)' }]
    const activeAccounts = insightAccounts ?? accounts.map(account => account.id)
    return <ConsoleHub id="dashboard" title="Overview" entry={consoleRoute.entry?.id === 'dashboard' ? consoleRoute.entry : undefined}
      period={`Balances as of ${fullDayLabel(today)}`}
      figure={{ label: 'Net worth', cents: currentNetWorth }}
      strip={[{ label: '30-day net movement', cents: summary.data?.net_movement_30d_cents, signed: true }]}
      art={netWorthTrend.length ? { label: 'Monthly net worth', values: netWorthTrend } : consoleRoute.entry?.id === 'dashboard' ? consoleRoute.entry.art : undefined}
      onBack={consoleRoute.back}>
      <ReportStatus report={summary} label="Portfolio" />
      <FocusRow label="Primary modules" className="console-module-grid">
        <ConsoleModule title="Cumulative net worth" kind="chart" tools={<div className="console-chart-switch">
          <button type="button" aria-pressed={chartType === 'line'} onClick={() => setChartType('line')}>Line</button>
          <button type="button" aria-pressed={chartType === 'bar'} onClick={() => setChartType('bar')}>Bar</button>
        </div>}>
          <ReportStatus report={history} label="Net worth history" />
          {history.data && !history.data.length && <p>No monthly history yet.</p>}
          {netWorthTrend.length > 0 && <>
            {chartType === 'line' ? <Area consoleStyle series={chartSeries} labels={netWorthLabels} height={275} ariaLabel="Cumulative net worth" />
              : <Bar consoleStyle series={chartSeries} labels={netWorthLabels} height={275} ariaLabel="Cumulative net worth by month" />}
            <ConsoleChartValues labels={netWorthMonths.map(monthLabel)} series={chartSeries} />
          </>}
        </ConsoleModule>
        <div className="console-module-companions">
          <ConsoleModule title="Asset allocation" order={1}>
            {summary.data && (liquidSum || investSum ? <AllocationDonut consoleStyle totalLabel="Gross assets" data={allocation} /> : <p>No cash or investment assets to allocate.</p>)}
          </ConsoleModule>
          <ConsoleModule title="Holdings" kind="flat" order={2}>
            <ul className="console-holdings">
              {accounts.map(account => <li key={account.id}>
                <div>{account.name}<small>{account.type}{account.institution ? ` · ${account.institution}` : ''}</small></div>
                <span className="tabular-nums">{fmtCents(account.balance)}</span>
              </li>)}
            </ul>
          </ConsoleModule>
        </div>
      </FocusRow>
      <FocusRow label="Secondary modules" className="console-module-secondary">
        <ConsoleModule title="Spending insights" kind="flat" order={3}
          tools={topCategory && <button type="button" className="console-chart-values"
            onClick={() => go('expenses', { state: { source: 'dashboard-insight', from: flowFrom, to: flowTo } })}>
            View all spending →
          </button>}>
          <div className="console-hub-filters console-spending-filters" role="group" aria-label="Spending insights filters">
            <DateRangePicker from={overviewRange.from} to={overviewRange.to} onFrom={overviewRange.changeFrom}
              onTo={overviewRange.changeTo} min={MIN_DATE} max={MAX_DATE} presets={PRESETS}
              activePreset={overviewRange.preset} onPreset={overviewRange.applyPreset} />
            <MultiSelect options={accounts.map(account => ({ value: account.id, label: account.name }))} selected={activeAccounts}
              onChange={setInsightAccounts} allLabel="All accounts" emptyLabel="No accounts" noun="accounts" />
          </div>
          <ReportStatus report={flow} label="Spending insights" />
          {flow.data && spendingInsights}
        </ConsoleModule>
        <ConsoleModule title="Recent activity" kind="flat" order={4}>{recent}</ConsoleModule>
      </FocusRow>
      {drawer}
    </ConsoleHub>
  }

  return (
    <Screen>
      {header}
      {/* 
        GRID LAYOUT GUIDE:
        - The <Grid> wrapper is defined in 'app/src/components/Screen.tsx'.
        - On desktop, it is a 3-column layout (class 'xl:grid-cols-3').
        - On mobile/tablet, it defaults to a 1-column layout.
      */}
      <ReportStatus report={summary} label="Portfolio" /><ReportStatus report={flow} label="Cash flow" />
      <Grid>
        {/* 
          Row 1: Three Hero KPI Cards 
          Each card takes up 1 column by default, filling the 3-column row on desktop.
        */}
        <div className="relative">
          <HeroCard variant="tile" netWorth={currentNetWorth ?? 0} monthChangePct={netWorthMonthChangePct} />
        </div>

        <Tile>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">30-day income flow</div>
          <div className="mt-2 text-[32px] font-bold tabular-nums tracking-tight">{fmt(inc)}</div>
          <div className={`mt-1.5 text-[12.5px] font-semibold ${incChangePct >= 0 ? 'text-pos' : 'text-neg'}`}>
            {incChangePct >= 0 ? '▲' : '▼'} {incChangePct >= 0 ? '+' : ''}{incChangePct}% vs prior 30 days · {savings}% savings rate
          </div>
        </Tile>

        <Tile>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">30-day expense flow</div>
          <div className="mt-2 text-[32px] font-bold tabular-nums tracking-tight">{fmt(spend)}</div>
          <div className={`mt-1.5 text-[12.5px] font-semibold ${spendChangePct <= 0 ? 'text-pos' : 'text-neg'}`}>
            {spendChangePct <= 0 ? '▼' : '▲'} {spendChangePct >= 0 ? '+' : ''}{spendChangePct}% vs prior 30 days · {percentOfInflow}% of inflow
          </div>
        </Tile>

        {/* 
          Row 2: Custom Flex Layout for Precise Proportions
          - 'md:col-span-2 xl:col-span-3' makes this row span the full width of the grid.
          - 'flex flex-col xl:flex-row' makes the items stack vertically on tablet, and sit side-by-side on desktop.
          - 'gap-3.5' controls the horizontal/vertical spacing between the tiles.
        */}
        <div className="md:col-span-2 xl:col-span-3 flex flex-col xl:flex-row gap-3.5">
          {/* 
            Left Tile Wrapper (Cumulative Net Worth):
            - 'xl:w-[55%]' sets a precise horizontal width proportion (55% on desktop).
            - Change this percentage (e.g. xl:w-[60%]) to adjust the chart card's width.
          */}
          <div className="w-full xl:w-[55%] flex-shrink-0 flex flex-col">
            <Tile
              title="Cumulative net worth"
              tag={
                <div className="flex items-center gap-1.5 -my-1">
                  <button
                    onClick={() => setChartType('line')}
                    className={`px-2.5 py-0.5 rounded-[5px] text-[10px] font-bold tracking-[0.06em] uppercase transition ${
                      chartType === 'line'
                        ? 'bg-ink text-surface'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Line
                  </button>
                  <button
                    onClick={() => setChartType('bar')}
                    className={`px-2.5 py-0.5 rounded-[5px] text-[10px] font-bold tracking-[0.06em] uppercase transition ${
                      chartType === 'bar'
                        ? 'bg-ink text-surface'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Bar
                  </button>
                </div>
              }
              className="h-full pb-3.5"
            >
              <div className="mt-1">
                <ReportStatus report={history} label="Net worth history" />
                {history.data && !history.data.length && <p>No monthly history yet.</p>}
                {netWorthTrend.length > 0 && (chartType === 'line' ? (
                  <Area key="line" series={[{ data: netWorthTrend, color: 'var(--color-accent)' }]} labels={netWorthLabels} height={240} />
                ) : (
                  <Bar key="bar" series={[{ data: netWorthTrend, color: 'var(--color-accent)' }]} labels={netWorthLabels} height={240} />
                ))}
              </div>
            </Tile>
          </div>

          {/* 
            Right Tile Wrapper (Asset Allocation):
            - 'xl:flex-1' makes this tile dynamically take up all remaining horizontal space on desktop (100% - 55% = 45%).
            - Changing the left tile's percentage automatically recalculates this card's width.
          */}
          <div className="w-full xl:flex-1 flex flex-col">
            <Tile title="Asset allocation" className="h-full pb-3.5">
              <AllocationDonut data={allocation} />
            </Tile>
          </div>
        </div>

        {/* Row 3: account inventory + data-backed spending observations. */}
        <Tile title="Holdings" tag={`${accounts.length} linked`}>
          <div className="mt-2 grid gap-1.5">
            {accounts.map((a) => (
              <div
                key={a.name}
                className="flex items-center gap-3 py-2 px-2.5 -mx-2.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] rounded-[10px] cursor-pointer transition duration-200"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `color-mix(in srgb, ${glowColor[a.glow as Glow]} 12%, transparent)`,
                    color: glowColor[a.glow as Glow],
                  }}
                >
                  {getAccountIcon(a.type, a.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-ink truncate">{a.name}</div>
                  <div className="text-[10px] uppercase tracking-[0.06em] text-muted mt-0.5">{a.type}</div>
                </div>
                <div className={`text-[13.5px] font-bold tabular-nums ${a.balance < 0 ? 'text-neg' : 'text-ink'}`}>
                  {fmtCents(a.balance)}
                </div>
              </div>
            ))}
          </div>
        </Tile>

        {spendingInsights}

        {/* 
          Row 4: Recent Activity 
          - 'span={3}' translates to 'md:col-span-2 xl:col-span-3', stretching this card across the full width (3 columns) at the bottom.
        */}
        <Tile title="Recent activity" tag={`last ${RECENT_ACTIVITY_COUNT}`} span={3}>
          {recent}
        </Tile>
      </Grid>
      {drawer}
    </Screen>
  )
}

type CategoryAmount = { category: string; amount: number }
type CategoryChange = CategoryAmount & { delta: number }

function SpendingInsights({
  topCategory,
  topCategoryShare,
  largestCategoryChange,
  savings,
  income,
  reviewCount,
  onExploreExpenses,
  onExploreCategory,
  onReviewLedger,
  onExploreIncome,
  period,
}: {
  topCategory: CategoryAmount | null
  topCategoryShare: number
  largestCategoryChange: CategoryChange | null
  savings: number
  income: number
  reviewCount: number
  onExploreExpenses: () => void
  onExploreCategory: (category: string) => void
  onReviewLedger: () => void
  onExploreIncome: () => void
  period?: string
}) {
  const { theme } = useView()
  const consoleStyle = theme === 'console'
  const money = consoleStyle ? fmtCents : fmt
  const panel = (content: ReactNode, tag: ReactNode) => consoleStyle ? content : (
    <Tile title="Spending insights" tag={tag} span={2} className="flex min-h-[300px] flex-col overflow-hidden">
      {content}
    </Tile>
  )
  if (!topCategory) {
    return panel(
        <div className={`flex flex-1 flex-col items-start justify-center rounded-[14px] border border-dashed border-[var(--hair)] bg-[var(--hair-soft)] px-5 ${consoleStyle ? 'py-5' : ''}`}>
          <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-ink">No settled outflows yet</span>
          <p className="mt-2 max-w-md text-[15px] leading-6 text-muted">Insights appear once spending activity has settled. Importing a statement or reviewing recent activity will make this panel useful.</p>
          <button type="button" onClick={onReviewLedger} className="mt-5 text-[14px] font-semibold text-accent-ink transition hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
            Review transactions →
          </button>
        </div>,
        'last 30 days',
    )
  }

  const changeDirection = (largestCategoryChange?.delta ?? 0) >= 0 ? 'increased' : 'decreased'
  const changeTone = changeDirection === 'increased' ? 'text-neg' : 'text-pos'

  return panel(<>
      <div className="flex flex-1 flex-col gap-3.5">
        <button
          type="button"
          onClick={() => onExploreCategory(topCategory.category)}
          aria-label={consoleStyle ? undefined : `Explore ${topCategory.category} spending for ${period ?? "the last 30 days"}`}
          className="group w-full rounded-[14px] border border-[color-mix(in_srgb,var(--color-accent)_35%,var(--hair))] bg-[var(--accent-wash)] px-4 py-3.5 text-left transition hover:border-accent/60 hover:bg-[color-mix(in_srgb,var(--accent-wash)_72%,var(--surface))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink">Largest outflow</p>
              <p className="mt-1.5 max-w-xl text-[17px] font-semibold leading-6 tracking-tight text-ink">
                <span className={consoleStyle ? undefined : 'text-accent-ink'}>{topCategory.category}</span> was your largest outflow: {money(topCategory.amount)} ({topCategoryShare}% of spending).
              </p>
              <p className="mt-2 body-copy">Explore this category in the Expenses analysis <span className="font-semibold text-accent-ink group-hover:underline">→</span></p>
            </div>
            <span aria-hidden="true" className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full border border-accent/30 bg-[var(--surface)] text-[16px] font-bold tabular-nums text-accent-ink">{topCategoryShare}%</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--track)]">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, topCategoryShare)}%` }} />
          </div>
        </button>

        <div className="grid gap-3 sm:grid-cols-2">
          {largestCategoryChange ? (
            <InsightAction
              eyebrow="Period change"
              sentence={`${largestCategoryChange.category} ${changeDirection} by ${money(Math.abs(largestCategoryChange.delta))} versus ${period ? "the preceding period" : "the prior 30 days"}.`}
              tone={consoleStyle ? 'text-ink' : changeTone}
              action="Explore category →"
              onClick={() => onExploreCategory(largestCategoryChange.category)}
            />
          ) : (
            <InsightSentence eyebrow="Period change" sentence="A comparison will appear once a prior 30-day period is available." />
          )}
          {reviewCount > 0 ? (
            <InsightAction
              eyebrow="Needs attention"
              sentence={`${reviewCount} transaction${reviewCount === 1 ? '' : 's'} need${reviewCount === 1 ? 's' : ''} review before this period is fully classified.`}
              tone={consoleStyle ? 'text-ink' : 'text-warn'}
              action="Review transactions →"
              onClick={onReviewLedger}
            />
          ) : (
            <InsightAction
              eyebrow="Cash flow"
              sentence={income > 0 ? `You saved ${savings}% of settled inflow after spending this period.` : 'A savings insight will appear once settled inflow is recorded.'}
              tone={!consoleStyle && income > 0 ? (savings >= 0 ? 'text-pos' : 'text-neg') : 'text-muted'}
              action="Explore income →"
              onClick={onExploreIncome}
            />
          )}
        </div>
      </div>
      <p className="mt-4 border-t border-[var(--hair-soft)] pt-3.5 text-[11.5px] text-muted">Based on settled activity {period ? `for ${period}` : 'from the last 30 days'}.</p>
    </>,
    <button type="button" onClick={onExploreExpenses} className="font-semibold text-accent-ink transition hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">View all spending →</button>,
  )
}

function InsightAction({ eyebrow, sentence, tone, action, onClick }: { eyebrow: string; sentence: string; tone: string; action: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group rounded-[12px] border border-[var(--hair-soft)] bg-[var(--input-bg)] px-3.5 py-3 text-left transition hover:border-accent/50 hover:bg-[var(--hair-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{eyebrow}</p>
      <p className={`mt-1.5 text-[14px] font-medium leading-5 ${tone}`}>{sentence}</p>
      <p className="mt-2 text-[12.5px] font-semibold text-accent-ink group-hover:underline">{action}</p>
    </button>
  )
}

function InsightSentence({ eyebrow, sentence }: { eyebrow: string; sentence: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--hair-soft)] bg-[var(--input-bg)] px-3.5 py-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{eyebrow}</p>
      <p className="mt-1.5 text-[14px] leading-5 text-muted">{sentence}</p>
    </div>
  )
}
