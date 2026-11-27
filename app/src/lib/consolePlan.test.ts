import { describe, expect, it } from 'vitest'
import type { Account } from '../data'
import type { PlanningGoal } from './planning'
import type { Series } from './recurring'
import { billWhen, goalProgress, planBills, planGoals, planReadState } from './consolePlan'

const accounts = [
  { id: 'everyday', name: 'Everyday', type: 'Liquid', balance: 250_000 },
  { id: 'savings', name: 'Savings', type: 'Savings', balance: 1_000_000 },
] as Account[]
const goal = (id: string, patch: Partial<PlanningGoal> = {}): PlanningGoal => ({
  id, name: `Goal ${id}`, metric: 'cash', targetCents: 2_500_000, targetDate: null, status: 'active',
  accountIds: ['everyday', 'savings'], updatedAt: '2026-11-01T00:00:00Z', ...patch,
})
const series = (id: string, nextExpected: string, expected: number, patch: Partial<Series> = {}) =>
  ({ id, label: id, nextExpected, expected, status: 'active', kind: 'fixed', ...patch }) as Series

describe('Console Plan goals', () => {
  it('measures a goal from its accounts in exact cents, whatever its status', () => {
    expect(goalProgress(goal('a'), accounts)).toEqual({ valueCents: 1_250_000, percent: 50 })
    expect(goalProgress(goal('b', { status: 'paused', targetCents: 1_000_000 }), accounts)).toEqual({ valueCents: 1_250_000, percent: 100 })
  })
  it('leaves progress unmeasured rather than zero', () => {
    expect(goalProgress(goal('a', { accountIds: ['everyday', 'gone'] }), accounts)).toBeUndefined()
    expect(goalProgress(goal('a', { accountIds: [] }), accounts)).toBeUndefined()
    expect(goalProgress(goal('a', { targetCents: 0 }), accounts)).toBeUndefined()
  })
  it('splits active from paused and archived and features the Overview ring goal', () => {
    const goals = [goal('a'), goal('b', { status: 'archived' }), goal('c', { targetCents: 1_000_000 }), goal('d', { accountIds: ['gone'] })]
    const result = planGoals(goals, accounts, 'c')
    expect(result.active.map(item => item.id)).toEqual(['a', 'c', 'd'])
    expect(result.inactive.map(item => item.id)).toEqual(['b'])
    expect(result.featured?.id).toBe('c')
    expect(result.active.find(item => item.id === 'c')?.reached).toBe(true)
    // Without a measurable ring goal, the first measurable active goal leads.
    expect(planGoals(goals, accounts, 'd').featured?.id).toBe('a')
    expect(planGoals([goal('d', { accountIds: ['gone'] })], accounts).featured).toBeUndefined()
  })
})

describe('Console Plan bills', () => {
  it('sums the bills due in the next 14 days and lists every active bill soonest first', () => {
    const result = planBills([
      series('Later', '2026-12-20', 5_000), series('Soon', '2026-11-28', 1_999),
      series('Today', '2026-11-22', 12_345, { kind: 'variable' }), series('Missed', '2026-11-20', 4_000),
      series('Edge', '2026-12-05', 1_000), series('Past edge', '2026-12-06', 1_000),
      series('Dormant', '2026-11-25', 9_900, { status: 'dormant' }),
    ], '2026-11-22')
    expect(result.until).toBe('2026-12-05')
    expect(result.due.map(item => item.id)).toEqual(['Today', 'Soon', 'Edge'])
    expect(result.dueCents).toBe(12_345 + 1_999 + 1_000)
    expect(result.estimated).toBe(true)
    expect(result.upcoming.map(item => item.id)).toEqual(['Missed', 'Today', 'Soon', 'Edge', 'Past edge', 'Later'])
  })
  it('reports nothing due as a measured zero only once bills have loaded', () => {
    expect(planBills([], '2026-11-22')).toMatchObject({ due: [], dueCents: 0, upcoming: [], estimated: false })
  })
  it('names dates in house style', () => {
    expect(billWhen('2026-11-22', '2026-11-22')).toBe('Due today')
    expect(billWhen('2026-11-23', '2026-11-22')).toBe('Due tomorrow')
    expect(billWhen('2026-11-28', '2026-11-22')).toBe('Due 28 Nov')
    expect(billWhen('2026-11-20', '2026-11-22')).toBe('Was due 20 Nov')
    expect(billWhen('2027-01-03', '2026-12-30')).toBe('Due 3 Jan 2027')
  })
})

describe('Console Plan read state', () => {
  const read = (patch: Partial<{ data: unknown; pending: boolean; error: boolean }>) => ({ data: null, pending: true, error: false, ...patch })
  it('never reports a source nothing asked for as empty', () => {
    expect(planReadState(false, read({ pending: true }))).toBe('cold')
    expect(planReadState(true, read({ pending: true }))).toBe('loading')
    expect(planReadState(true, read({ pending: false, error: true }))).toBe('failed')
    expect(planReadState(true, read({ data: {}, pending: true }))).toBe('ready')
    expect(planReadState(true, read({ data: {}, pending: false, error: true }))).toBe('ready')
  })
})
