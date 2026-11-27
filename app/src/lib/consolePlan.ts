import type { Account } from '../data'
import type { PlanningGoal } from './planning'
import { dayLabel, fullDayLabel } from './period'
import { currentValueFor } from './projections'
import { shiftedDay } from './recurrenceScope'
import type { Series } from './recurring'

/* Console Plan row derivations for the Goals and Bills hubs and their Home
 * previews. They read planning goals and recurring series the session already
 * holds. A value that can't be measured is left undefined, never shown as zero. */

export type GoalProgress = { valueCents: number; percent: number }

/**
 * A goal's current value, from the same account balances Strategic projections
 * uses, and its share of the target from 0 to 100%. Undefined when the target
 * isn't a positive whole number of cents or an account is missing from the directory.
 */
export function goalProgress(goal: PlanningGoal, accounts: Account[]): GoalProgress | undefined {
  if (!Number.isSafeInteger(goal.targetCents) || goal.targetCents <= 0) return undefined
  const scoped = accounts.filter(account => goal.accountIds.includes(account.id))
  if (!goal.accountIds.length || scoped.length !== new Set(goal.accountIds).size) return undefined
  const valueCents = currentValueFor(goal.metric === 'net_worth' ? 'netWorth' : 'cash', scoped)
  return { valueCents, percent: Math.max(0, Math.min(100, Math.floor(valueCents * 100 / goal.targetCents))) }
}

export type GoalView = PlanningGoal & { progress?: GoalProgress; reached: boolean }
export type PlanGoals = { active: GoalView[]; inactive: GoalView[]; featured?: GoalView }

/**
 * Active goals keep the planning order (most recently updated first). The
 * featured goal is the one the Overview ring tracks when it's active and
 * measurable, otherwise the first measurable active goal.
 */
export function planGoals(goals: PlanningGoal[], accounts: Account[], ringGoal?: string | null): PlanGoals {
  const views = goals.map((goal): GoalView => {
    const progress = goalProgress(goal, accounts)
    return { ...goal, progress, reached: !!progress && progress.valueCents >= goal.targetCents }
  })
  const active = views.filter(goal => goal.status === 'active')
  const inactive = views.filter(goal => goal.status !== 'active')
  const featured = active.find(goal => goal.id === ringGoal && goal.progress) ?? active.find(goal => goal.progress)
  return { active, inactive, featured }
}

export const BILLS_WINDOW_DAYS = 14

export type PlanBills = {
  /** Active series expected from today through the window's last day, soonest first. */
  due: Series[]
  /** Sum of the due series' expected amounts, in cents. */
  dueCents: number
  /** Every active series, soonest expected first. */
  upcoming: Series[]
  /** True when a due amount is a variable series' estimate. */
  estimated: boolean
  until: string
}

export function planBills(active: Series[], today: string, days = BILLS_WINDOW_DAYS): PlanBills {
  const until = shiftedDay(today, days - 1)
  const upcoming = active.filter(series => series.status === 'active')
    .sort((a, b) => a.nextExpected.localeCompare(b.nextExpected) || a.label.localeCompare(b.label))
  const due = upcoming.filter(series => series.nextExpected >= today && series.nextExpected <= until)
  return {
    due, upcoming, until,
    dueCents: due.reduce((total, series) => total + series.expected, 0),
    estimated: due.some(series => series.kind === 'variable'),
  }
}

export type PlanReadState = 'cold' | 'loading' | 'failed' | 'ready'

/**
 * What a Plan source can say. Data kept from before a refresh still counts as
 * ready. A source nothing has asked for this session is `cold`, never empty.
 */
export function planReadState(requested: boolean, read: { data: unknown; pending: boolean; error: boolean }): PlanReadState {
  if (read.data) return 'ready'
  if (!requested) return 'cold'
  if (read.error) return 'failed'
  return 'loading'
}

/** Whole days from `today` to an ISO date, negative when the date has passed. */
export function daysUntil(date: string, today: string) {
  return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000)
}

/** When a bill is next expected, in house dates: "Due today", "Due 28 Nov" or "Was due 20 Nov". */
export function billWhen(date: string, today: string) {
  const days = daysUntil(date, today)
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  const label = date.slice(0, 4) === today.slice(0, 4) ? dayLabel(date) : fullDayLabel(date)
  return days < 0 ? `Was due ${label}` : `Due ${label}`
}

/** Cadence names in Australian English. The stored value stays `Biweekly`. */
export const cadenceText: Record<Series['cadence'], string> = {
  Weekly: 'Weekly', Biweekly: 'Fortnightly', Monthly: 'Monthly', Quarterly: 'Quarterly', Annual: 'Annual',
}
