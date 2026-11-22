import { expect, test } from 'vitest'
import { dateRangeLabel, monthAxisLabels } from './period'

test('house date ranges put the day first and qualify a cross-year range', () => {
  expect(dateRangeLabel('2026-10-24', '2026-11-22')).toBe('24 Oct – 22 Nov')
  expect(dateRangeLabel('2026-12-27', '2027-01-03')).toBe('27 Dec 2026 – 3 Jan 2027')
})

test('month axes insert the year only when it changes', () => {
  expect(monthAxisLabels(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']))
    .toEqual(['Nov', 'Dec', 'Jan 2027', 'Feb'])
})
