import { describe, expect, it } from 'vitest'
import type { Series } from './recurring'
import { billsDue, consoleNotices, noticeGapText, noticeTab, type NoticeInputs } from './consoleNotices'

const ready = <T,>(value: T) => ({ state: 'ready' as const, value })
const none: NoticeInputs = {
  budget: ready(0), bills: ready({ count: 0 }), ledger: ready(0), transfers: ready(0), goals: ready([]),
}

describe('Control Centre notices', () => {
  it('ranks in a fixed order and shows at most three', () => {
    const result = consoleNotices({
      budget: ready(2), bills: ready({ count: 3, next: { label: 'Streaming', date: '2026-11-30' } }),
      ledger: ready(14), transfers: ready(1), goals: ready(['Emergency fund']),
    })
    expect(result.state).toBe('notices')
    if (result.state !== 'notices') return
    expect(result.total).toBe(5)
    expect(result.notices.map(item => [item.kind, item.status, item.detail])).toEqual([
      ['budget', '2 checks', 'Need attention this period'],
      ['bills', '3 due', 'Next: Streaming, 30 Nov'],
      ['ledger', '14 to review', 'Uncategorised or flagged transactions'],
    ])
  })
  it('keeps the order when earlier sources are quiet', () => {
    const result = consoleNotices({ ...none, transfers: ready(1), goals: ready(['Emergency fund', 'Car', 'Trip']) })
    expect(result.state === 'notices' && result.notices.map(item => [item.kind, item.status, item.detail])).toEqual([
      ['transfers', '1 to review', 'Possible transfers to confirm'],
      ['goals', '3 targets reached', 'Emergency fund and 2 others'],
    ])
  })
  it('is all caught up only when every checked source is empty', () => {
    expect(consoleNotices(none)).toEqual({ state: 'clear', gaps: { notChecked: [], failed: [] } })
    const { budget: _off, ...budgetOff } = none
    expect(consoleNotices(budgetOff)).toEqual({ state: 'clear', gaps: { notChecked: [], failed: [] } })
  })
  it('waits while any source loads and never counts a missing source as zero', () => {
    expect(consoleNotices({ ...none, bills: { state: 'loading' } })).toEqual({ state: 'checking' })
    const result = consoleNotices({ ...none, budget: { state: 'not-checked' }, goals: { state: 'failed' }, ledger: ready(2) })
    expect(result).toMatchObject({ state: 'notices', total: 1, gaps: { notChecked: ['budget'], failed: ['goals'] } })
    if (result.state !== 'notices') return
    expect(noticeGapText(result.gaps)).toBe('Couldn’t check goals. Budget is checked once you open it.')
    expect(noticeGapText({ notChecked: [], failed: ['bills', 'ledger', 'transfers'] }))
      .toBe('Couldn’t check recurring bills, Ledger review or transfers.')
  })
})

describe('Bills due', () => {
  const series = (label: string, nextExpected: string, status: Series['status'] = 'active') => ({ label, nextExpected, status }) as Series
  it('counts active series due from today through the next 13 days, soonest first', () => {
    expect(billsDue([
      series('Gym', '2026-12-10'), series('Phone', '2026-11-27'), series('Insurance', '2026-12-11'),
      series('Old plan', '2026-11-20', 'dormant'), series('Water', '2026-11-26'), series('Rent', '2026-11-27'),
    ], '2026-11-27')).toEqual({ count: 3, next: { label: 'Phone', date: '2026-11-27' } })
    expect(billsDue([], '2026-11-27')).toEqual({ count: 0, next: undefined })
  })
})

describe('Notice tab requests', () => {
  const tabs = [{ id: 'analytics' }, { id: 'recurring' }]
  it('opens only a known tab from a Control Centre notice', () => {
    expect(noticeTab({ source: 'control-centre', tab: 'recurring' }, tabs)).toBe('recurring')
    expect(noticeTab({ source: 'control-centre', tab: 'missing' }, tabs)).toBeUndefined()
    expect(noticeTab({ source: 'dashboard-insight', tab: 'recurring' }, tabs)).toBeUndefined()
    expect(noticeTab(null, tabs)).toBeUndefined()
  })
})
