import { describe, expect, it } from 'vitest'
import type { Account } from '../data'
import { budgetPresentation } from './budgetPresentation'
import { BUDGET_METHOD, type Snapshot } from './budgetWorkspace'
import type { BudgetLimit } from './budgetItems'
import type { PlanningGoal } from './planning'
import { budgetHomeCards, goalRing, topExpenseCategories } from './consoleHome'

function snapshot(limits: BudgetLimit[], state: 'current' | 'future' = 'current'): Snapshot {
  const plan = { income_cents: 600000, drawdown_cents: 0, allocations: [] }
  const actuals = { gross_expense_cents: 151000, expense_credits_cents: 0, net_expense_cents: 151000, earned_income_cents: 300000, pending_signed_cents: 0 }
  const facts = { period_id: 'period', start_date: '2026-11-01', end_date: '2026-12-01', original_plan: plan, latest_plan: plan, actuals,
    opening_carry_cents: 0, closing_everyday_cents: 29000, scope_valid: true, coverage_complete: true, excluded_cents: 0, unassigned_credit_cents: 0 }
  return { tenant_id: 'tenant', source_revision: '7', method: BUDGET_METHOD, write_enabled: true,
    accounts: [{ id: 'account', name: 'Activity', currency: 'AUD' }],
    account_scope: [{ original_account_id: 'account', account_id: 'account', role: 'activity', start_date: '2026-11-01', end_date: null }],
    plan: { id: 'plan', version: '3', currency: 'AUD', timezone: 'Australia/Sydney', frequency: 'monthly', anchor: null },
    period: { id: 'period', start_date: '2026-11-01', end_date: '2026-12-01', timezone: 'Australia/Sydney', frequency: 'monthly' },
    revision: { income_cents: 600000, drawdown_cents: 0 }, lines: [], scope_valid: true, coverage_complete: true, actuals, unallocated_cents: 0,
    details: { source_revision: '7', plan_version: '3', undo_operation_id: null,
      taxonomy: [{ id: 'groceries', name: 'Groceries' }, { id: 'dining', name: 'Dining' }, { id: 'transport', name: 'Transport' },
        { id: 'fun', name: 'Entertainment' }, { id: 'home', name: 'Household' }],
      taxonomy_scopes: [], planning_goals: [], recurring: [], claims: [], items: [], limits,
      other_flexible_cents: 0, other_flexible_used_cents: 0, other_opening_carry_cents: 0, other_flexible_remaining_cents: 0, excluded_cents: 0, unassigned_credit_cents: 0,
      lifecycle: { state, as_of: '2026-11-22', carry_mode: 'fresh', provisional_carry: false, chain_valid: true, facts, review: null,
        changed_since_review: false, previous_id: null, next_id: null, is_latest: true, periods: [] } },
  } as Snapshot
}
const limit = (id: string, amount: number, used?: number): BudgetLimit =>
  ({ id: `limit-${id}`, category_id: id, subcategory_id: null, custom_subcategory_id: null, amount_cents: amount, used_cents: used, remaining_cents: null, opening_carry_cents: 0 })

describe('Console Home expense categories', () => {
  it('sums subcategory facets and shares each category of gross outflow, like the Expenses hub', () => {
    const shares = topExpenseCategories([
      { period: 'current', category: 'Housing', gross_cents: 100000 },
      { period: 'current', category: 'Groceries', gross_cents: 30000 },
      { period: 'current', category: 'Housing', gross_cents: 63500 },
      { period: 'prior', category: 'Transport', gross_cents: 900000 },
      { period: 'current', category: 'Income', gross_cents: 0 },
      { period: 'current', category: 'Uncategorized', gross_cents: 20000 },
    ], 250000)
    expect(shares).toEqual([
      { category: 'Housing', name: 'Housing', cents: 163500, share: 163500 / 250000 },
      { category: 'Groceries', name: 'Groceries', cents: 30000, share: 30000 / 250000 },
      { category: 'Uncategorized', name: 'Uncategorised', cents: 20000, share: 20000 / 250000 },
    ])
  })
  it('keeps a missing report distinct from a period without outflow', () => {
    expect(topExpenseCategories(undefined, undefined)).toBeUndefined()
    expect(topExpenseCategories([], undefined)).toBeUndefined()
    expect(topExpenseCategories([], 0)).toEqual([])
  })
})

describe('Console Home Budget cards', () => {
  it('stays cold, loading or failed without a loaded workspace and never starts a read', () => {
    expect(budgetHomeCards(false, 'idle', undefined)).toEqual({ state: 'cold' })
    expect(budgetHomeCards(false, 'loading', undefined)).toEqual({ state: 'loading' })
    expect(budgetHomeCards(false, 'preparing', undefined)).toEqual({ state: 'loading' })
    expect(budgetHomeCards(false, 'failed', undefined)).toEqual({ state: 'failed' })
  })
  it('reports a missing plan, a pool-only plan and another period instead of zero cards', () => {
    expect(budgetHomeCards(true, 'ready', undefined)).toEqual({ state: 'no-plan' })
    expect(budgetHomeCards(true, 'ready', budgetPresentation(snapshot([])))).toEqual({ state: 'no-limits' })
    expect(budgetHomeCards(true, 'ready', budgetPresentation(snapshot([limit('groceries', 50000, 1000)], 'future')))).toEqual({ state: 'other-period' })
    const incompatible = snapshot([limit('groceries', 50000, 1000)]); incompatible.details!.plan_version = '2'
    expect(budgetHomeCards(true, 'ready', budgetPresentation(incompatible))).toEqual({ state: 'unavailable' })
  })
  it('hides figures while the workspace refreshes or after a failed refresh', () => {
    const s = snapshot([limit('groceries', 50000, 1000)])
    expect(budgetHomeCards(true, 'loading', budgetPresentation(s, 'loading'))).toEqual({ state: 'refreshing' })
    expect(budgetHomeCards(true, 'failed', budgetPresentation(s, 'failed'))).toEqual({ state: 'failed' })
  })
  it('keeps Budget order for up to four categories and measures exact cents', () => {
    const p = budgetPresentation(snapshot([
      limit('groceries', 80000, 40000), limit('dining', 30000, 33001), limit('transport', 20000, 19999),
      limit('fun', 10000), limit('home', 0, 500),
    ]))
    const result = budgetHomeCards(true, 'ready', p)
    expect(result.state).toBe('cards')
    if (result.state !== 'cards') return
    expect(result.total).toBe(5)
    expect(result.cards.map(card => [card.name, card.progress, card.over])).toEqual([
      ['Groceries', 50, false], ['Dining', 100, true], ['Transport', 99, false], ['Entertainment', undefined, false],
    ])
    expect(result.cards[1].spent).toMatchObject({ availability: 'known', cents: 33001 })
    // Missing usage stays unavailable rather than becoming a zero.
    expect(result.cards[3].spent.availability).toBe('unavailable')
  })
})

describe('Console Home goal ring', () => {
  const account = (id: string, type: Account['type'], balance: number) => ({ id, name: id, type, balance, glow: 'cyan' }) as Account
  const accounts = [account('cash', 'Liquid', 4000000), account('save', 'Savings', 2000000), account('shares', 'Invest', 9000000)]
  const goal = (changes: Partial<PlanningGoal> = {}): PlanningGoal => ({ id: 'goal', name: 'Emergency fund', metric: 'cash', targetCents: 10000000,
    targetDate: null, status: 'active', accountIds: ['cash', 'save', 'shares'], updatedAt: '2026-11-01', ...changes })

  it('uses the Strategic projections value for the goal metric and scope', () => {
    expect(goalRing([goal()], 'goal', accounts)).toEqual({ goalId: 'goal', name: 'Emergency fund', percent: 60, valueCents: 6000000, targetCents: 10000000 })
    expect(goalRing([goal({ metric: 'net_worth', targetCents: 30000000 })], 'goal', accounts)?.percent).toBe(50)
    expect(goalRing([goal({ targetCents: 3000000 })], 'goal', accounts)?.percent).toBe(100)
    expect(goalRing([goal({ accountIds: ['cash'], targetCents: 3 })], 'goal', [account('cash', 'Liquid', -5)])?.percent).toBe(0)
  })
  it('keeps the trend art when no goal can be measured', () => {
    expect(goalRing([goal()], null, accounts)).toBeUndefined()
    expect(goalRing(undefined, 'goal', accounts)).toBeUndefined()
    expect(goalRing([goal()], 'other', accounts)).toBeUndefined()
    expect(goalRing([goal({ status: 'paused' })], 'goal', accounts)).toBeUndefined()
    expect(goalRing([goal({ targetCents: 0 })], 'goal', accounts)).toBeUndefined()
    expect(goalRing([goal({ accountIds: [] })], 'goal', accounts)).toBeUndefined()
    expect(goalRing([goal({ accountIds: ['cash', 'closed'] })], 'goal', accounts)).toBeUndefined()
  })
})
