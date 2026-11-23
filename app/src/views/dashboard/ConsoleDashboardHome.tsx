import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ConsoleHome from '../../components/console/ConsoleHome'
import { cumulativeValues, type ConsoleArt, type ConsoleFigure } from '../../components/console/ConsoleHub'
import { dashboardWindow, useCachedDashboardReports } from '../../components/console/DashboardReports'
import type { ConsoleOutlet } from '../../components/console/ConsoleViewport'
import { useData } from '../../contexts/DataContext'
import { useRedactBalances } from '../../hooks/useRedactBalances'
import { expenseEffectCents, isEarnedIncome } from '../../lib/classification'
import { dateRangeLabel, fullDayLabel } from '../../lib/period'
import { useView } from '../../router'
import { useDashboardTransaction } from './DashboardActivity'

export default function ConsoleDashboardHome({ route }: { route: ConsoleOutlet }) {
  const { accounts } = useData()
  const { go } = useView()
  const navigate = useNavigate()
  const redacted = useRedactBalances()
  const editor = useDashboardTransaction(redacted)
  const { today, from: thirtyDaysAgoIso } = dashboardWindow()
  const { summary, activity, history, flow } = useCachedDashboardReports()

  useEffect(() => { void import('../Income') }, [])

  const { active, select, restoreFocus } = route
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
  const cards = flowPeriod ? activity.data?.filter(transaction => {
    if (transaction.date < thirtyDaysAgoIso || transaction.date > today || transaction.isTransfer) return false
    return active === 'income' ? isEarnedIncome(transaction) : expenseEffectCents(transaction) !== 0
  }) : activity.data ?? undefined
  const latestDate = activity.data?.[0]?.date
  return <>
    <ConsoleHome
      activeId={active}
      selectSection={select}
      restoreFocus={restoreFocus}
      covered={editor.open}
      activity={cards}
      activityReport={activity}
      figureReport={flowPeriod ? flow : summary}
      redacted={redacted}
      accounts={accounts}
      period={dateRangeLabel(thirtyDaysAgoIso, today, true)}
      latestDate={latestDate ? fullDayLabel(latestDate) : undefined}
      openTransaction={editor.edit}
      figures={previewFigures}
      trends={previewArt}
      open={(section, accountId) => {
        route.begin({ id: section, headline: previewFigures[section]?.[0], art: previewArt[section] })
        if (section === 'dashboard') {
          navigate('/dashboard?hub=overview')
        } else if (section === 'accounts' && accountId) {
          go(section, { state: { accountId } })
        } else if (section === 'expenses') {
          go(section, { state: { source: 'dashboard-insight', from: thirtyDaysAgoIso, to: today } })
        } else {
          go(section)
        }
      }}
    />
    {editor.drawer}
  </>
}
