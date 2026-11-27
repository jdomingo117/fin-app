import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ConsoleHome from '../../components/console/ConsoleHome'
import { cumulativeValues, type ConsoleArt, type ConsoleFigure } from '../../components/console/ConsoleHub'
import { dashboardWindow, useCachedDashboardReports } from '../../components/console/DashboardReports'
import type { ConsoleOutlet } from '../../components/console/ConsoleViewport'
import { useData } from '../../contexts/DataContext'
import { useBudget } from '../../contexts/BudgetContext'
import { budgetPresentation } from '../../lib/budgetPresentation'
import { useRedactBalances } from '../../hooks/useRedactBalances'
import { expenseEffectCents, isEarnedIncome } from '../../lib/classification'
import { dateRangeLabel, fullDayLabel } from '../../lib/period'
import { useView } from '../../router'
import { usePlanReports } from '../../components/console/PlanReports'
import { planBills, planGoals, planReadState, BILLS_WINDOW_DAYS } from '../../lib/consolePlan'
import { TODAY } from '../../lib/period'
import { useConsolePreferences } from '../../components/console/ConsolePreferences'
import { budgetHomeCards, goalRing, topExpenseCategories } from '../../lib/consoleHome'
import { fmtCents } from '../../data'
import { useDashboardTransaction } from './DashboardActivity'

export default function ConsoleDashboardHome({ route }: { route: ConsoleOutlet }) {
  const { accounts } = useData()
  const { go } = useView()
  const { snapshot, readState, pending } = useBudget()
  const budgetPreview = snapshot?.plan ? budgetPresentation(snapshot, readState, { pendingWrite: !!pending }) : undefined
  const budgetCards = budgetHomeCards(!!snapshot, readState, budgetPreview)
  // The ring reads planning goals only after this device has chosen one in Settings.
  // The Plan previews show what the session already holds and never start a read.
  const overviewGoal = useConsolePreferences()?.preferences.overviewGoal ?? null
  const { planning, recurrence, requested } = usePlanReports({ planning: !!overviewGoal })
  const ring = goalRing(planning.data?.planningGoals, overviewGoal, accounts)
  const goals = planning.data ? planGoals(planning.data.planningGoals, accounts, overviewGoal) : undefined
  const bills = recurrence.data ? planBills(recurrence.data.active, TODAY) : undefined
  const goalState = planReadState(requested.planning, planning)
  const billState = planReadState(requested.recurrence, recurrence)
  const featured = goals?.featured
  const remaining = budgetPreview?.phase === 'current' && budgetPreview.everyday.remaining.freshness !== 'stale'
    ? budgetPreview.everyday.remaining : undefined
  const navigate = useNavigate()
  const redacted = useRedactBalances()
  const editor = useDashboardTransaction(redacted)
  const { today, from: thirtyDaysAgoIso } = dashboardWindow()
  const { summary, activity, history, flow } = useCachedDashboardReports()

  useEffect(() => { void import('../Income') }, [])

  const { active, select, restoreFocus, rowTiles } = route
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
    ...(remaining?.availability === 'known' ? { budget: [{ label: 'Left for everyday spending', cents: remaining.cents }] } : {}),
    goals: featured?.progress ? [
      { label: featured.name, cents: featured.progress.valueCents },
      { label: 'Target', cents: featured.targetCents },
      { label: 'To go', cents: Math.max(0, featured.targetCents - featured.progress.valueCents) },
    ] : [{ label: 'Progress', placeholder: planPrompt(goalState, !goals ? 'Open to see your goals' : goals.active.length ? 'Progress unavailable' : 'No active goals') }],
    bills: bills?.upcoming.length ? [
      { label: `Due in the next ${BILLS_WINDOW_DAYS} days`, cents: bills.dueCents },
      { label: 'Monthly commitment', cents: recurrence.data!.monthlyCommitment },
    ] : [{ label: `Due in the next ${BILLS_WINDOW_DAYS} days`, placeholder: planPrompt(billState, bills ? 'No bills detected' : 'Open to see what’s due') }],
    ingestion: [{ label: 'Bank statements', placeholder: 'Open to import' }],
  }
  const trendArt: ConsoleArt = { label: 'Monthly net worth', values: history.data?.map(point => point.value) ?? [] }
  const previewArt: Partial<Record<typeof active, ConsoleArt>> = {
    dashboard: ring ? {
      label: `Progress toward ${ring.name}, ${fmtCents(ring.valueCents)} of ${fmtCents(ring.targetCents)}`,
      percent: ring.percent, caption: ring.name,
    } : trendArt,
    ...(cash + investments > 0 ? { accounts: { label: 'Cash share of assets', percent: Math.round(cash / (cash + investments) * 100) } } : {}),
    income: { label: 'Cumulative inflow for this period', values: cumulativeValues(flow.data?.buckets.map(point => point.earned_cents) ?? []) },
    expenses: { label: 'Cumulative gross outflow for this period', values: cumulativeValues(flow.data?.buckets.map(point => point.gross_cents) ?? []) },
    ...(featured?.progress ? { goals: {
      label: `Progress toward ${featured.name}, ${fmtCents(featured.progress.valueCents)} of ${fmtCents(featured.targetCents)}`,
      percent: featured.progress.percent, caption: featured.name,
    } } : {}),
  }
  const cards = flowPeriod ? activity.data?.filter(transaction => {
    if (transaction.date < thirtyDaysAgoIso || transaction.date > today || transaction.isTransfer) return false
    return active === 'income' ? isEarnedIncome(transaction) : expenseEffectCents(transaction) !== 0
  }) : activity.data ?? undefined
  const latestDate = activity.data?.[0]?.date
  return <>
    <ConsoleHome
      activeId={active}
      rowTiles={rowTiles}
      goals={{ state: goalState, goals }}
      bills={{ state: billState, bills, today: TODAY }}
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
      budgetCards={budgetCards}
      expenseCategories={topExpenseCategories(flow.data?.categories, flow.data?.periods.current.gross_cents)}
      open={(section, accountId) => {
        // The Overview hub draws the net worth trend, so it receives that art rather than the goal ring.
        route.begin({ id: section, headline: previewFigures[section]?.[0], art: section === 'dashboard' ? trendArt : previewArt[section] })
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

/** The headline text for a Plan source that has no figure yet. */
function planPrompt(state: ReturnType<typeof planReadState>, ready: string) {
  return state === 'loading' ? 'Loading…' : state === 'failed' ? 'Unavailable' : ready
}
