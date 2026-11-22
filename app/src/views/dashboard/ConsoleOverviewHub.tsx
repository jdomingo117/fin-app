import { useState } from 'react'
import AllocationDonut from '../../components/AllocationDonut'
import { DateRangePicker, MultiSelect } from '../../components/Controls'
import ReportStatus from '../../components/ReportStatus'
import Area from '../../components/charts/Area'
import Bar from '../../components/charts/Bar'
import ConsoleHub, { ConsoleChartValues, ConsoleModule } from '../../components/console/ConsoleHub'
import { dashboardWindow, useCachedDashboardReports, useDashboardCashFlow } from '../../components/console/DashboardReports'
import type { ConsoleOutlet } from '../../components/console/ConsoleViewport'
import { FocusRow } from '../../components/console/FocusRow'
import { useData } from '../../contexts/DataContext'
import { fmtCents } from '../../data'
import { usePeriodRange } from '../../hooks/usePeriodRange'
import { useRedactBalances } from '../../hooks/useRedactBalances'
import { dateRangeLabel, fullDayLabel, MAX_DATE, MIN_DATE, monthAxisLabels, monthLabel, PRESETS } from '../../lib/period'
import { useView } from '../../router'
import { DashboardActivity, useDashboardTransaction } from './DashboardActivity'
import { dashboardAllocation, SpendingInsights } from './SpendingInsights'

export default function ConsoleOverviewHub({ route }: { route: ConsoleOutlet }) {
  const { accounts } = useData()
  const { go } = useView()
  const redacted = useRedactBalances()
  const editor = useDashboardTransaction(redacted)
  const [chartType, setChartType] = useState<'line' | 'bar'>('line')
  const { today, from } = dashboardWindow()
  const overviewRange = usePeriodRange(undefined, { from, to: today })
  const [insightAccounts, setInsightAccounts] = useState<string[] | null>(null)
  const { summary, activity, history, flow: unscopedFlow } = useCachedDashboardReports()
  const { from: flowFrom, to: flowTo } = overviewRange
  const scoped = flowFrom !== from || flowTo !== today || insightAccounts !== null
  const scopedFlow = useDashboardCashFlow(flowFrom, flowTo, insightAccounts ?? undefined, scoped)
  const flow = scoped ? scopedFlow : unscopedFlow
  const entry = route.entry?.id === 'dashboard' ? route.entry : undefined
  const currentNetWorth = summary.data?.net_worth_cents ?? entry?.headline?.cents
  const netWorthTrend = history.data?.map(point => point.value) ?? []
  const netWorthMonths = history.data?.map(point => point.month) ?? []
  const netWorthLabels = monthAxisLabels(netWorthMonths)
  const liquidSum = summary.data?.cash_asset_cents ?? 0
  const investSum = summary.data?.investment_asset_cents ?? 0
  const allocation = dashboardAllocation(liquidSum, investSum)
  const chartSeries = [{ label: 'Net worth', data: netWorthTrend, color: 'var(--console-chart-ink)' }]
  const art = history.data === null ? entry?.art :
    netWorthTrend.length ? { label: 'Monthly net worth', values: netWorthTrend } : undefined
  const activeAccounts = insightAccounts ?? accounts.map(account => account.id)
  return <ConsoleHub id="dashboard" title="Overview" entry={entry}
    period={`Balances as of ${fullDayLabel(today)}`}
    figure={{ label: 'Net worth', cents: currentNetWorth }}
    strip={[{ label: '30-day net movement', cents: summary.data?.net_movement_30d_cents, signed: true }]}
    art={art}
    onBack={route.back} redacted={redacted}>
    <ReportStatus report={summary} label="Portfolio" />
    <FocusRow label="Primary modules" className="console-module-grid">
      <ConsoleModule title="Cumulative net worth" kind="chart" tools={<div className="console-chart-switch">
        <button type="button" aria-pressed={chartType === 'line'} onClick={() => setChartType('line')}>Line</button>
        <button type="button" aria-pressed={chartType === 'bar'} onClick={() => setChartType('bar')}>Bar</button>
      </div>}>
        <ReportStatus report={history} label="Net worth history" />
        {history.data && !history.data.length && <p>No monthly history yet.</p>}
        {netWorthTrend.length > 0 && (redacted ? <p>Net worth values are hidden.</p> : <>
          {chartType === 'line' ? <Area consoleStyle series={chartSeries} labels={netWorthLabels} height={275} ariaLabel="Cumulative net worth" />
            : <Bar consoleStyle series={chartSeries} labels={netWorthLabels} height={275} ariaLabel="Cumulative net worth by month" />}
          <ConsoleChartValues labels={netWorthMonths.map(monthLabel)} series={chartSeries} />
        </>)}
      </ConsoleModule>
      <div className="console-module-companions">
        <ConsoleModule title="Asset allocation" order={1}>
          {summary.data && (redacted ? <p>Asset values are hidden.</p> : liquidSum || investSum
            ? <AllocationDonut consoleStyle totalLabel="Gross assets" data={allocation} />
            : <p>No cash or investment assets to allocate.</p>)}
        </ConsoleModule>
        <ConsoleModule title="Holdings" kind="flat" order={2}>
          {accounts.length ? <ul className="console-holdings">
            {accounts.map(account => <li key={account.id}>
              <div>{account.name}<small>{account.type}{account.institution ? ` · ${account.institution}` : ''}</small></div>
              {redacted ? <span>Balance hidden</span> : <span className="tabular-nums">{fmtCents(account.balance)}</span>}
            </li>)}
          </ul> : <p>No linked accounts yet.</p>}
        </ConsoleModule>
      </div>
    </FocusRow>
    <FocusRow label="Secondary modules" className="console-module-secondary">
      <ConsoleModule title="Spending insights" kind="flat" order={3}
        tools={flow.data?.categories.some(facet => facet.period === 'current' && facet.gross_cents) && <button type="button" className="console-chart-values"
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
        {flow.data && (redacted ? <p>Spending insight amounts are hidden.</p> :
          <SpendingInsights flow={flow.data} from={flowFrom} to={flowTo} period={dateRangeLabel(flowFrom, flowTo)} />)}
      </ConsoleModule>
      <ConsoleModule title="Recent activity" kind="flat" order={4}>
        <DashboardActivity report={activity} onEdit={editor.edit} redacted={redacted} consoleStyle />
      </ConsoleModule>
    </FocusRow>
    {editor.drawer}
  </ConsoleHub>
}
