import { expect, it } from 'vitest'
import { resolveProjectionGoal } from './goalSelection'

const paused = { id: 'paused', status: 'paused', metric: 'net_worth' } as const
const cash = { id: 'cash', status: 'active', metric: 'cash' } as const
const goals = [paused, cash]

it('initially selects the first active goal', () => {
  expect(resolveProjectionGoal(goals, undefined, 'netWorth')).toEqual({ goal: cash, metric: 'cash' })
})

it('keeps Net worth when a measure switch clears the Cash goal', () => {
  expect(resolveProjectionGoal(goals, null, 'netWorth')).toEqual({ goal: null, metric: 'netWorth' })
})

it('keeps Temporary calculator selected even as goals load', () => {
  expect(resolveProjectionGoal([], null, 'cash')).toEqual({ goal: null, metric: 'cash' })
  expect(resolveProjectionGoal(goals, null, 'cash')).toEqual({ goal: null, metric: 'cash' })
})

it('uses the saved measure when a goal is explicitly selected', () => {
  expect(resolveProjectionGoal(goals, 'paused', 'cash')).toEqual({ goal: paused, metric: 'netWorth' })
  expect(resolveProjectionGoal(goals, 'cash', 'netWorth')).toEqual({ goal: cash, metric: 'cash' })
})
