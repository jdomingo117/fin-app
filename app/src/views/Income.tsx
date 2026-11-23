import {reportParent} from '../lib/reportParent'
import { FocusRow } from '../components/console/FocusRow'
import { useMemo, useState, useEffect, type ReactNode } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Screen, ViewHeader } from '../components/Screen'
import Tile from '../components/Tile'
import Area from '../components/charts/Area'
import AllocationDonut from '../components/AllocationDonut'
import Ledger from '../components/Ledger'
import SegmentedTabs from '../components/SegmentedTabs'
import HeroMetric from '../components/HeroMetric'
import AnalyzerFilters from '../components/AnalyzerFilters'
import { usePeriodRange } from '../hooks/usePeriodRange'
import { useResponsiveChartSize } from '../hooks/useResponsiveChartSize'
import { addDays, dateRangeLabel, dayLabel, iso, MAX_DATE, MIN_DATE, monthAxisLabels, monthLabel, PRESETS } from '../lib/period'
import { cashFlowGranularity } from '../lib/cashFlowSeries'
import {cashFlow, latestLines} from '../lib/reports'
import {useReport} from '../hooks/useReport'
import ReportStatus from '../components/ReportStatus'
import { fmt, fmtCents, type Txn } from '../data'
import { useData } from '../contexts/DataContext'
import StrategicProjections from '../components/StrategicProjections'
import { ease, gridStagger } from '../components/motion'
import { useView } from '../router'
import { useConsolePreferences } from '../components/console/ConsolePreferences'
import { DateRangePicker, MultiSelect } from '../components/Controls'
import ConsoleHub, { ConsoleChartValues, ConsoleModule, consoleMoney, type ConsoleEntry } from '../components/console/ConsoleHub'
import type { ConsoleOutlet } from '../components/console/ConsoleViewport'
import TransactionCategoryDrawer from '../components/TransactionCategoryDrawer'

const TABS = [
  { id: 'analyzer', label: 'Income analyzer' },
  { id: 'projections', label: 'Strategic projections' },
]

export default function Income() {
  const [view, setView] = useState('analyzer')
  const { theme } = useView()
  const audio = useConsolePreferences()
  const consoleRoute = useOutletContext<ConsoleOutlet | null>()
  const today = new Date()
  const { preset, from, to, applyPreset, changeFrom, changeTo } = usePeriodRange(undefined,
    theme === 'console' ? { from: iso(addDays(today, -29)), to: iso(today) } : undefined)
  
  const { accounts: dbAccounts } = useData()

  const INFLOW_ACCOUNTS = useMemo(() => {
    if (!dbAccounts || dbAccounts.length === 0) return []
    return dbAccounts.map(a => ({ id: a.id, name: a.name, share: 1 / dbAccounts.length }))
  }, [dbAccounts])

  const ACCOUNT_OPTIONS = useMemo(() => INFLOW_ACCOUNTS.map((a) => ({
    value: a.id,
    label: a.name,
    hint: '',
  })), [INFLOW_ACCOUNTS])

  const [accounts, setAccounts] = useState<string[]>(() => theme === 'console' ? dbAccounts.map(account => account.id) : [])
  
  useEffect(() => {
    if (dbAccounts.length > 0 && accounts.length === 0) {
      setAccounts(dbAccounts.map(a => a.id))
    }
  }, [dbAccounts])

  if (theme === 'console' && consoleRoute) return (
    <IncomeAnalyzer from={from} to={to} accounts={accounts} dbAccountsLength={dbAccounts.length}
      consoleHub={{
        back: consoleRoute.back,
        entry: consoleRoute.entry?.id === 'income' ? consoleRoute.entry : undefined,
        tabs: <SegmentedTabs tabs={TABS} active={view} onChange={next => { if (next !== view) audio?.play('tab'); setView(next) }} layoutId="income-hub-tabs" />,
        filters: view === 'analyzer' ? <>
          <DateRangePicker from={from} to={to} min={MIN_DATE} max={MAX_DATE} presets={PRESETS}
            activePreset={preset} onPreset={applyPreset} onFrom={changeFrom} onTo={changeTo} />
          <MultiSelect options={ACCOUNT_OPTIONS} selected={accounts} onChange={setAccounts}
            allLabel="All accounts" emptyLabel="No accounts" noun="accounts" />
        </> : undefined,
        projections: view === 'projections',
      }}
    />
  )

  return (
    <Screen>
      <div className="relative z-30 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <ViewHeader index="03 — Inflow" title="Income" sub="Earning streams, cash flow & savings rate" />
          <div className="pt-1.5">
            <SegmentedTabs tabs={TABS} active={view} onChange={setView} layoutId="income-tabs" />
          </div>
        </div>

        {view === 'analyzer' && (
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
            rangeLayoutId="income-range"
          />
        )}
      </div>

      <AnimatePresence mode="wait">
        {view === 'analyzer' ? (
          <motion.div
            key="analyzer"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease }}
          >
            <IncomeAnalyzer from={from} to={to} accounts={accounts} dbAccountsLength={dbAccounts.length} />
          </motion.div>
        ) : (
          <motion.div
            key="projections"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease }}
          >
            <StrategicProjections />
          </motion.div>
        )}
      </AnimatePresence>
    </Screen>
  )
}



function IncomeAnalyzer({ from, to, accounts, dbAccountsLength, consoleHub }: {
  from: string; to: string; accounts: string[]; dbAccountsLength: number
  consoleHub?: { back: () => void; tabs: ReactNode; filters?: ReactNode; projections: boolean; entry?: ConsoleEntry }
}) {
  const { accounts: accountList, refreshData } = useData()
  const { go, toast } = useView()
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null)
  const parent = useReport(selectedTransactionId,tenant=>reportParent(tenant,selectedTransactionId!,accountList),!!selectedTransactionId)
  const granularity = cashFlowGranularity(from,to)
  const params = {p_from:from,p_to:to,p_account_ids:accounts,p_bucket:granularity}
  const report = useReport(params, tenant => cashFlow(tenant,params))
  const scope = {from,to,accounts}
  const deposits = useReport(scope,tenant=>latestLines(tenant,6,scope))
  const sources = new Map<string,{value:number; count:number; largest:number; latest:string}>()
  for (const facet of report.data?.categories ?? []) {
    if (facet.period !== 'current' || !facet.deposit_count) continue
    const label = facet.category || 'Other'
    const source = sources.get(label) ?? {value:0,count:0,largest:0,latest:''}
    source.value += facet.earned_cents
    source.count += facet.deposit_count
    source.largest = Math.max(source.largest,facet.largest_deposit_cents)
    if (facet.latest_deposit && facet.latest_deposit > source.latest) source.latest = facet.latest_deposit
    sources.set(label,source)
  }
  const colors = ['cyan','green','blue','red','amber'] as const
  const sourceSlices = [...sources].sort((a,b)=>b[1].value-a[1].value)
    .map(([label,source],i)=>({label,value:source.value,glow:colors[i%colors.length]}))
  const activeSource = selectedSource && sources.has(selectedSource) ? selectedSource : sourceSlices[0]?.label
  const examples = useReport([scope,activeSource],tenant=>latestLines(tenant,3,{...scope,source:activeSource}),!!activeSource)
  if (!report.data && !consoleHub) return <ReportStatus report={report} label="Income report" />
  const totalInflow = report.data?.periods.current.earned_cents ?? 0
  const totalOutflow = report.data?.periods.current.expense_cents ?? 0
  const buckets = report.data?.buckets ?? []
  const inc = buckets.map(b=>b.earned_cents)
  const exp = buckets.map(b=>b.expense_cents)
  const net = inc.map((v,i)=>v-exp[i])
  const dates = buckets.map(bucket => bucket.bucket)
  const labels = consoleHub && granularity === 'month' ? monthAxisLabels(dates)
    : dates.map(granularity === 'month' ? monthLabel : dayLabel)
  const n = inc.length || 1
  const peakVal = Math.max(0,...inc)
  const surplus = totalInflow-totalOutflow
  const cumulative = (values:number[]) => {
    let total = 0
    return values.map(v=>(total+=v))
  }
  const m = {
    totalInflow,totalOutflow,n,prorated:totalInflow/n,peakVal,peakPeriod:peakVal ? labels[inc.indexOf(peakVal)] : '—',
    coverage:totalOutflow ? totalInflow/totalOutflow : 0,surplus,savingsRate:totalInflow ? surplus/totalInflow : 0,
    periodRates:inc.map((v,i)=>v ? net[i]/v : 0),cumInflow:cumulative(inc),cumNet:cumulative(net),
    flow:{granularity,labels},sourceSlices,deposits:deposits.data ?? [],
  }
  const acctLabel =
    accounts.length === dbAccountsLength
      ? 'All accounts'
      : accounts.length === 0
        ? 'No accounts'
        : accounts.length === 1
          ? '1 account'
          : `${accounts.length} accounts`
  const covPositive = m.coverage >= 1
  const periodUnit = m.flow.granularity === 'day' ? 'day' : m.flow.granularity === 'week' ? 'week' : 'month'
  const periodCadenceLabel = m.flow.granularity === 'day' ? 'daily' : m.flow.granularity === 'week' ? 'weekly' : 'monthly'


  const refreshAfterTransactionEdit = async () => {
    await refreshData()
    toast({ title: 'Transaction updated', sub: 'Income analytics have been refreshed.' })
  }

  const sourcesContent = m.totalInflow > 0 ? <>
    <AllocationDonut consoleStyle={!!consoleHub} showTotal={!consoleHub} data={m.sourceSlices} totalLabel="Period inflow" selectedLabel={activeSource}
      onSelect={slice => setSelectedSource(slice.label)} />
    {activeSource && <><ReportStatus report={examples} label="Source deposits" /><IncomeSourceActivity
      category={activeSource}
      total={m.sourceSlices.find(slice => slice.label === activeSource)?.value ?? 0}
      periodTotal={m.totalInflow}
      transactions={examples.data ?? []}
      source={sources.get(activeSource)!}
      onEdit={transaction => setSelectedTransactionId(transaction.parentTransactionId ?? transaction.id)}
      onViewAll={() => go('ledger', { state: { source: 'income-source', category: activeSource, accountIds: accounts, from, to, incomeOnly: true } })}
    /></>}
  </> : <div className="grid place-items-center py-12 text-center text-[12.5px] text-muted">No inflow for the current filters.</div>
  const depositsContent = <>
    <ReportStatus report={deposits} label="Recent deposits" />
    {deposits.data && (m.deposits.length ? (
      <Ledger consoleStyle={!!consoleHub} rows={m.deposits} onEdit={transaction => setSelectedTransactionId(transaction.parentTransactionId ?? transaction.id)} />
    ) : <div className="grid place-items-center py-10 text-center text-[12.5px] text-muted">No deposits in the selected range.</div>)}
  </>
  const drawer = <>
    {selectedTransactionId && <ReportStatus report={parent} label="Transaction details" />}
    <TransactionCategoryDrawer transaction={parent.data} onClose={() => setSelectedTransactionId(null)} onChanged={refreshAfterTransactionEdit} />
  </>

  if (consoleHub) {
    const period = dateRangeLabel(from, to, true)
    const series = [
      { label: 'Inflow', data: m.cumInflow, color: 'var(--console-chart-ink)' },
      { label: 'Net after spending', data: m.cumNet, color: 'var(--console-chart-net)', fill: false },
    ]
    return <ConsoleHub id="income" title="Income" period={period} onBack={consoleHub.back}
      tabs={consoleHub.tabs} filters={consoleHub.filters} entry={consoleHub.entry}
      figure={{ label: 'Total inflow', cents: report.data ? m.totalInflow : report.pending ? consoleHub.entry?.headline?.cents : undefined }}
      strip={report.data ? [
        { label: 'Spending', cents: totalOutflow },
        { label: 'Net after spending', cents: m.surplus, signed: true },
        { label: `Average ${periodCadenceLabel} inflow`, cents: Math.round(m.prorated) },
      ] : []}
      art={report.data ? (totalInflow > 0 ? { label: 'Retained', percent: Math.round(m.savingsRate * 100) } : undefined) : consoleHub.entry?.art}>
      {consoleHub.projections ? <StrategicProjections /> : <>
        <ReportStatus report={report} label="Income report" />
        {report.data && <>
          <FocusRow label="Primary modules" className="console-module-grid">
            <ConsoleModule title="Cash flow pacing" kind="chart" tools={<div className="console-chart-legend">
              <span>Inflow</span><span>Net after spending</span>
            </div>}>
              {labels.length > 0 && <>
                <Area consoleStyle series={series} labels={labels} height={265} ariaLabel="Cumulative inflow and net cash flow" />
                <ConsoleChartValues labels={labels} series={series} />
              </>}
            </ConsoleModule>
            <div className="console-module-companions">
              <ConsoleModule title="Period balance" order={1}>
                <dl className="console-module-readouts">
                  <div><dt>Inflow / outflow coverage</dt><dd>{totalOutflow ? `${m.coverage.toFixed(2)}×` : 'No outflow'}</dd></div>
                  <div><dt>Prior-period inflow</dt><dd className="tabular-nums">{fmtCents(report.data.periods.prior.earned_cents)}</dd></div>
                </dl>
              </ConsoleModule>
              <ConsoleModule title="Recent deposits" kind="flat" order={2}>{depositsContent}</ConsoleModule>
            </div>
          </FocusRow>
          <FocusRow label="Secondary modules" className="console-module-secondary">
            <ConsoleModule title="Income sources" kind="flat" order={3}>{sourcesContent}</ConsoleModule>
            <ConsoleModule title={`Inflow by ${periodUnit}`} kind="flat" order={4}>
              <dl className="console-module-readouts">
                <div><dt>Highest inflow · {m.peakPeriod}</dt><dd className="tabular-nums">{fmtCents(m.peakVal)}</dd></div>
                <div><dt>{periodUnit === 'day' ? 'Days in range' : `${periodUnit === 'week' ? 'Weeks' : 'Months'} in range`}</dt><dd>{labels.length}</dd></div>
              </dl>
            </ConsoleModule>
          </FocusRow>
        </>}
        {drawer}
      </>}
    </ConsoleHub>
  }

  return (
    <motion.div
      variants={gridStagger}
      initial="hidden"
      animate="show"
      className="mt-5 grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.62fr)_minmax(360px,1fr)]"
    >
      <ReportStatus report={report} label="Income report" />
      {/* Row 1 — period KPI hero cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:col-span-2 xl:col-span-2 xl:grid-cols-4">
        <HeroMetric
          label="Total period inflow"
          value={fmt(m.totalInflow)}
          sub={`${acctLabel} · ${dayLabel(from)}–${dayLabel(to)}`}
        />
        <HeroMetric
          label={`Average inflow per ${periodUnit}`}
          value={fmt(m.prorated)}
          sub={`${m.n} ${periodUnit}${m.n === 1 ? '' : 's'} in selected range`}
        />
        <HeroMetric
          label="Peak inflow period"
          value={fmt(m.peakVal)}
          sub={`${m.peakPeriod} · highest ${periodUnit}`}
        />
        <HeroMetric
          label="Inflow / outflow coverage"
          value={`${m.coverage.toFixed(2)}×`}
          valueClass={covPositive ? 'text-pos' : 'text-neg'}
          sub={`${covPositive ? '▲' : '▼'} ${fmt(Math.abs(m.surplus))} ${covPositive ? 'surplus' : 'deficit'}`}
          tone={covPositive ? 'pos' : 'neg'}
        />
      </div>

      {/* Row 2 — cumulative pacing + savings rate */}
      <Tile title="Cash flow pacing" tag={`cumulative · ${periodCadenceLabel}`} span={2} className="xl:col-span-1">
        <div className="mb-2 mt-0.5 flex items-center gap-4">
          <LegendDot color="var(--color-pos)" label="Cumulative inflow" />
          <LegendDot color="var(--color-blue)" label="Cumulative net" />
        </div>
        <Area
          key={`pace-${from}-${to}-${accounts.join(',')}`}
          series={[
            { data: m.cumInflow, color: 'var(--color-pos)', label: 'Inflow' },
            { data: m.cumNet, color: 'var(--color-blue)', label: 'Net' },
          ]}
          labels={m.flow.labels}
          height={230}
        />
      </Tile>
      <SavingsTile rate={m.savingsRate} saved={m.surplus} monthlyRates={m.periodRates} target={0.2} />

      {/* Row 3 — inflow categories + recent deposits */}
      <Tile title="Inflow categories" tag="share of inflow" span={2} className="flex h-full flex-col xl:col-span-1">
        {sourcesContent}
      </Tile>
      <Tile title="Recent deposits" tag={m.deposits.length ? `${m.deposits.length} shown` : 'none'}>
        {depositsContent}
      </Tile>
      {drawer}
    </motion.div>
  )
}

function IncomeSourceActivity({
  category,
  total,
  periodTotal,
  transactions,
  source,
  onEdit,
  onViewAll,
}: {
  category: string
  total: number
  periodTotal: number
  transactions: Txn[]
  source: {count:number;largest:number;latest:string}
  onEdit: (transaction: Txn) => void
  onViewAll: () => void
}) {
  const { theme } = useView()
  const money = theme === 'console' ? fmtCents : fmt
  const share = periodTotal > 0 ? Math.round((total / periodTotal) * 1000) / 10 : 0

  return (
    <section aria-label={`${category} income activity`} className="mt-5 border-t border-[var(--hair-soft)] pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className={theme === 'console' ? 'text-[13px] text-muted' : 'text-[11px] font-bold uppercase tracking-[0.1em] text-muted'}>Income activity · {category}</p>
          <p className="mt-1 text-[17px] font-bold tabular-nums text-ink">{money(total)} <span className="text-[13px] font-semibold text-muted">· {share}% of inflow</span></p>
        </div>
        <span className="text-[12.5px] font-semibold text-accent-ink">{source.count} deposit{source.count === 1 ? '' : 's'}</span>
      </div>

      <p className="mt-2 text-[12.5px] leading-5 text-muted">
        Largest deposit {money(source.largest)} · latest {dayLabel(source.latest)}.
      </p>

      <div className="mt-3 divide-y divide-[var(--hair-soft)] border-y border-[var(--hair-soft)]">
        {transactions.slice(0, 3).map((transaction) => (
          <button
            key={transaction.id}
            type="button"
            onClick={() => onEdit(transaction)}
            data-console-record-label={theme === 'console' || undefined}
            aria-label={theme === 'console' ? undefined : `Edit ${transaction.merchant} on ${dayLabel(transaction.date)}`}
            className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-left transition hover:bg-[var(--hair-soft)] focus-visible:bg-[var(--accent-wash)]"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-ink">{transaction.merchant}</p>
              <p className="mt-0.5 text-[12px] text-muted">{dayLabel(transaction.date)}{transaction.subcat ? ` · ${transaction.subcat}` : ''}</p>
            </div>
            <span className="flex items-center gap-2 text-[13px] font-bold tabular-nums"><span className={theme === 'console' ? undefined : 'text-pos'} data-sign={theme === 'console' && transaction.amount > 0 ? 'positive' : undefined}>{theme === 'console' ? consoleMoney(transaction.amount, true) : money(transaction.amount)}</span><span className="text-[12px] font-semibold text-accent-ink">Edit →</span></span>
          </button>
        ))}
      </div>

      <button type="button" onClick={onViewAll} className="mt-3 text-[13px] font-semibold text-accent-ink transition hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
        View matching Ledger transactions →
      </button>
    </section>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function Sparkline({ values, color, height = 30 }: { values: number[]; color: string; height?: number }) {
  const { ref: containerRef, width: w, height: h, ready } = useResponsiveChartSize({
    aspectRatio: 120 / height,
    minHeight: height,
    maxHeight: height,
  })
  if (values.length === 0) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const denom = values.length - 1 || 1
  const pts = values
    .map((v, i) => `${(i / denom) * w},${h - ((v - min) / span) * (h - 4) - 2}`)
    .join(' ')
  return (
    <div ref={containerRef} style={{ minHeight: height }}>
      {ready && <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="block">
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>}
    </div>
  )
}

function SavingsTile({
  rate,
  saved,
  monthlyRates,
  target,
}: {
  rate: number
  saved: number
  monthlyRates: number[]
  target: number
}) {
  const pos = rate >= 0
  const onTarget = rate >= target
  const R = 38
  const C = 2 * Math.PI * R
  const fill = Math.max(0, Math.min(1, rate))
  const ringColor = pos ? 'var(--color-pos)' : 'var(--color-neg)'
  const deltaPts = Math.round((rate - target) * 100)

  return (
    <Tile title="Savings rate" tag="vs 20% target" className="flex flex-col">
      <div className="flex items-center gap-4 pt-1">
        <div className="relative h-[92px] w-[92px] flex-shrink-0">
          <svg viewBox="0 0 92 92" className="h-full w-full -rotate-90">
            <circle cx={46} cy={46} r={R} fill="none" stroke="var(--track)" strokeWidth={7} />
            <motion.circle
              cx={46} cy={46} r={R} fill="none" stroke={ringColor} strokeWidth={7} strokeLinecap="round"
              strokeDasharray={C}
              initial={{ strokeDashoffset: C }}
              animate={{ strokeDashoffset: C * (1 - fill) }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <div
            className="absolute inset-0 grid place-items-center text-[19px] font-bold tabular-nums"
            style={{ color: ringColor }}
          >
            {Math.round(rate * 100)}%
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[24px] font-bold tabular-nums tracking-tight">{fmt(saved)}</div>
          <div className="mt-0.5 text-[11px] uppercase tracking-[0.06em] text-muted">saved this period</div>
        </div>
      </div>
      <div className="mt-auto pt-4">
        <Sparkline values={monthlyRates} color={ringColor} />
        <div className="mt-1.5 flex items-center justify-between text-[11px]">
          <span className="text-muted">Monthly rate trend</span>
          <span className={`font-semibold ${onTarget ? 'text-pos' : 'text-warn'}`}>
            {deltaPts >= 0 ? '+' : ''}{deltaPts} pts vs target
          </span>
        </div>
      </div>
    </Tile>
  )
}
