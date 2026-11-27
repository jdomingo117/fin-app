import { dayLabel } from './period'
import { shiftedDay } from './recurrenceScope'
import type { Series } from './recurring'

/* Control Centre notices. Each source reports what it actually knows: a source
 * that hasn't been read, is still loading or failed never counts as zero, so
 * "All caught up" only appears when every checked source came back empty. */

export type NoticeKind = 'budget' | 'bills' | 'ledger' | 'transfers' | 'goals'

/** Fixed rank: money already at risk, then money about to leave, then review
 * queues, then good news. */
export const NOTICE_ORDER: NoticeKind[] = ['budget', 'bills', 'ledger', 'transfers', 'goals']
export const NOTICE_LIMIT = 3
export const BILL_WINDOW_DAYS = 14

export type NoticeSource<T> =
  | { state: 'loading' }
  | { state: 'failed' }
  /** Budget is never read from Control Centre. Until Budget is opened this session, it isn't checked. */
  | { state: 'not-checked' }
  | { state: 'ready'; value: T }

export type BillsDue = { count: number; next?: { label: string; date: string } }
export type NoticeInputs = {
  /** Undefined when the Budget feature is off. */
  budget?: NoticeSource<number>
  bills: NoticeSource<BillsDue>
  ledger: NoticeSource<number>
  transfers: NoticeSource<number>
  goals: NoticeSource<string[]>
}

export type ConsoleNotice = { kind: NoticeKind; label: string; status: string; detail: string }
export type NoticeGaps = { notChecked: NoticeKind[]; failed: NoticeKind[] }
export type ConsoleNotices =
  | { state: 'checking' }
  | { state: 'notices'; notices: ConsoleNotice[]; total: number; gaps: NoticeGaps }
  | { state: 'clear'; gaps: NoticeGaps }

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

function notice(kind: NoticeKind, inputs: NoticeInputs): ConsoleNotice | undefined {
  const source = inputs[kind]
  if (source?.state !== 'ready') return undefined
  switch (kind) {
    case 'budget': {
      const count = source.value as number
      return count > 0 ? { kind, label: 'Budget', status: plural(count, 'check'), detail: 'Need attention this period' } : undefined
    }
    case 'bills': {
      const { count, next } = source.value as BillsDue
      return count > 0 ? { kind, label: 'Bills', status: `${count} due`,
        detail: next ? `Next: ${next.label}, ${dayLabel(next.date)}` : `In the next ${BILL_WINDOW_DAYS} days` } : undefined
    }
    case 'ledger': {
      const count = source.value as number
      return count > 0 ? { kind, label: 'Ledger review', status: `${count} to review`, detail: 'Uncategorised or flagged transactions' } : undefined
    }
    case 'transfers': {
      const count = source.value as number
      return count > 0 ? { kind, label: 'Transfers', status: `${count} to review`, detail: 'Possible transfers to confirm' } : undefined
    }
    case 'goals': {
      const names = source.value as string[]
      return names.length ? { kind, label: 'Goals', status: names.length === 1 ? 'Target reached' : `${names.length} targets reached`,
        detail: names.length === 1 ? names[0] : `${names[0]} and ${plural(names.length - 1, 'other')}` } : undefined
    }
  }
}

export function consoleNotices(inputs: NoticeInputs, limit = NOTICE_LIMIT): ConsoleNotices {
  const kinds = NOTICE_ORDER.filter(kind => inputs[kind] !== undefined)
  if (kinds.some(kind => inputs[kind]!.state === 'loading')) return { state: 'checking' }
  const gaps: NoticeGaps = {
    notChecked: kinds.filter(kind => inputs[kind]!.state === 'not-checked'),
    failed: kinds.filter(kind => inputs[kind]!.state === 'failed'),
  }
  const notices = kinds.map(kind => notice(kind, inputs)).filter((item): item is ConsoleNotice => !!item)
  return notices.length ? { state: 'notices', notices: notices.slice(0, limit), total: notices.length, gaps } : { state: 'clear', gaps }
}

/**
 * Active recurring series expected from today through the next 13 days, the
 * soonest first. Stopped and dismissed series are already outside `active`.
 */
export function billsDue(active: Series[], today: string, days = BILL_WINDOW_DAYS): BillsDue {
  const until = shiftedDay(today, days - 1)
  const due = active.filter(series => series.status === 'active' && series.nextExpected >= today && series.nextExpected <= until)
    .sort((a, b) => a.nextExpected.localeCompare(b.nextExpected) || a.label.localeCompare(b.label))
  return { count: due.length, next: due[0] && { label: due[0].label, date: due[0].nextExpected } }
}

export const noticeNames: Record<NoticeKind, string> = {
  budget: 'Budget', bills: 'recurring bills', ledger: 'Ledger review', transfers: 'transfers', goals: 'goals',
}

/** One sentence naming sources that weren't checked, or undefined when all were. */
export function noticeGapText(gaps: NoticeGaps) {
  const parts: string[] = []
  if (gaps.failed.length) parts.push(`Couldn’t check ${list(gaps.failed.map(kind => noticeNames[kind]))}.`)
  if (gaps.notChecked.includes('budget')) parts.push('Budget is checked once you open it.')
  return parts.length ? parts.join(' ') : undefined
}

function list(items: string[]) {
  return items.length < 3 ? items.join(' or ') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`
}

/** Navigation state a notice passes so its hub opens on the matching tab. */
export const noticeState = (tab: string) => ({ source: 'control-centre', tab })

export function noticeTab(state: unknown, tabs: readonly { id: string }[]) {
  const request = state as { source?: unknown; tab?: unknown } | null
  return request?.source === 'control-centre' && tabs.some(tab => tab.id === request.tab) ? request.tab as string : undefined
}
