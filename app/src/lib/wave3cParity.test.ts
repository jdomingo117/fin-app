import { expect, it } from 'vitest'
import type { Account, Txn } from '../data'
import { expandTransactionAllocations } from './allocations'
import { buildCashFlowSeries } from './cashFlowSeries'
import { deriveProjectionBaseline } from './projections'
import { isGrossExpense } from './classification'

// The RPC parity ledger. Account a is AUD and b is USD. Neither report converts FX.
const row = (id: string, amount: number, kind: Txn['kind'], extra: Partial<Txn> = {}): Txn =>
  ({ id, date: '2026-10-31', amount, kind, account_id: 'a', merchant: id, cat: 'Shopping', ...extra })

const parents = [
  row('salary', 10000, 'income'), row('usd', 10000, 'income', { account_id: 'b' }),
  row('shop', -900, 'expense', { subcat: 'Household', allocations: [
    { id: '1', position: 0, amount: -1000, kind: 'expense', category: 'Shopping' },
    { id: '2', position: 1, amount: 100, kind: 'reimbursement', category: 'Income' },
  ] }),
  row('refund', 400, 'refund'), row('reversal', -90, 'refund'),
  row('ordinary', -150, 'transfer', { kindSource: 'derived', transferState: 'rejected' }),
  row('pinned', -50, 'transfer', { kindSource: 'user', transferState: 'rejected' }),
  row('paired', -200, 'expense', { isTransfer: true, transferState: 'confirmed' }),
  row('hold', -300, 'expense', { pending: true }), row('anchor', 700, 'adjustment'),
  row('future', 999, 'income', { date: '2026-11-02' }),
]

it('characterizes the approved signed parent movement and reporting grain', () => {
  const lines = expandTransactionAllocations(parents)
  expect(lines.find(t => t.id === 'allocation:1')?.subcat).toBeUndefined()
  const asOf = '2026-11-01'
  const movement = parents.filter(t => !t.pending && !t.isTransfer && t.date >= '2026-10-03' && t.date <= asOf)
  expect(movement.reduce((s, t) => s + t.amount, 0)).toBe(19910)
  const report = (ids: string[] | null, transactions = lines) =>
    buildCashFlowSeries({ from: '2026-10-31', to: asOf, accountIds: ids ?? ['a', 'b'], transactions })
  expect(report(null).inflow).toEqual([20000, 0])
  expect(report([]).inflow).toEqual([0, 0])
  expect(report(null).outflow).toEqual([650, 0])
  expect(report(['a'], parents).outflow).toEqual([650, 0])
  expect(lines.filter(t => !t.isTransfer && isGrossExpense(t)).reduce((s, t) => s - t.amount, 0)).toBe(1150)
})

it('pins the Sydney month boundary, held balances and deterministic same-date order', () => {
  const instant = new Date('2026-10-31T13:00:00Z')
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instant)
  expect(local).toBe('2026-11-01')
  const october = parents.filter(t => t.date < local)
  expect(october.reduce((s, t) => s + t.amount, 0)).toBe(19410)
  expect(october.filter(t => !t.pending).reduce((s, t) => s + t.amount, 0)).toBe(19710)
  const ordered = [...parents].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  expect(ordered.slice(0, 3).map(t => t.id)).toEqual(['future', 'usd', 'shop'])
})

it('uses signed parent movements and stored cents for a mixed-currency projection', () => {
  const accounts: (Account & { currency: string })[] = [
    { id: 'a', name: 'AUD cash', currency: 'AUD', balance: 200, type: 'Liquid', glow: 'cyan' },
    { id: 'b', name: 'USD savings', currency: 'USD', balance: 300, type: 'Savings', glow: 'cyan' },
  ]
  const now = new Date(2026, 10, 1)
  const cash = deriveProjectionBaseline('cash', accounts, parents, now)
  expect(cash).toMatchObject({ monthsUsed: 1, fromMonth: '2026-10', monthlyFlow: 19710 })
  expect(deriveProjectionBaseline('netWorth', accounts, parents, now).monthlyFlow).toBe(19910)
})
