import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useBudget } from '../../contexts/BudgetContext'
import { useData } from '../../contexts/DataContext'
import { focusableElements } from '../../hooks/useDialogFocus'
import { usePortfolio } from '../../hooks/usePortfolio'
import { budgetPresentation } from '../../lib/budgetPresentation'
import { BUDGET_ENABLED } from '../../lib/budgetWorkspace'
import { goalRing } from '../../lib/consoleHome'
import { billsDue, consoleNotices, noticeGapText, noticeState, type ConsoleNotices, type NoticeKind, type NoticeSource } from '../../lib/consoleNotices'
import { TODAY } from '../../lib/period'
import { useView, type View } from '../../router'
import { useConsolePreferences } from './ConsolePreferences'
import { FocusRow } from './FocusRow'
import { usePlanReports } from './PlanReports'
import { GlassSurface } from './GlassSurface'
import { consoleDuration, useConsoleReducedMotion } from './motion'
import { hasCoveringOverlay, isEditableShortcutTarget } from './useScenePause'
import './control-centre.css'

const noticeIcons: Record<NoticeKind, string> = {
  budget: 'M12 3v9h9A9 9 0 1 1 12 3Zm3-.5A9 9 0 0 1 21.5 9H15z',
  bills: 'M5 5h14v15H5zM5 10h14M9 3v4m6-4v4',
  ledger: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h4',
  transfers: 'M4 8h15l-4-4M20 16H5l4 4',
  goals: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
}

/** Where each notice opens, with the state that shows the matching list. */
const noticeTargets: Record<NoticeKind, [View, { state?: unknown }?]> = {
  budget: ['budget'],
  bills: ['expenses', { state: noticeState('recurring') }],
  ledger: ['ledger', { state: { source: 'dashboard-insight', review: 'needs-review' } }],
  transfers: ['transfers'],
  goals: ['income', { state: noticeState('projections') }],
}

const actions = [
  { id: 'ledger', title: 'Ledger review', icon: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h4' },
  { id: 'transfers', title: 'Transfers', icon: 'M4 8h15l-4-4M20 16H5l4 4' },
  { id: 'ingestion', title: 'Ingestion', icon: 'M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4' },
  { id: 'settings', title: 'Settings', icon: 'M4 7h16M4 17h16M9 4v6m6 4v6' },
] as const

export function ControlCentre({ onOpenChange, onRest }: { onOpenChange: (open: boolean) => void; onRest?: () => void }) {
  const { go, toast, quietAlerts, setQuietAlerts } = useView()
  const { signOut } = useAuth()
  const portfolio = usePortfolio()
  // Bills and goals are read on the first open and kept for the session, shared with the Plan hubs.
  const [checked, setChecked] = useState(false)
  const { recurrence, planning } = usePlanReports({ planning: checked, recurrence: checked })
  const { accounts } = useData()
  const budget = useBudget()
  const { preferences, play, playFromGesture, toggle } = useConsolePreferences()!
  const reduced = useConsoleReducedMotion()
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const firstBoundary = useRef<HTMLSpanElement>(null)
  const lastBoundary = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLElement>()
  const pending = useRef<(() => void)>()
  const exitTimer = useRef<number>()
  const headingId = useId()
  const dialogId = useId()

  const show = useCallback((initiator?: HTMLElement) => {
    const node = dialog.current
    if (!node || node.open || hasCoveringOverlay(node)) return
    opener.current = initiator ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement : undefined)
    node.showModal()
    closeButton.current?.focus({ preventScroll: true })
    setChecked(true)
    setOpen(true)
    onOpenChange(true)
    playFromGesture('open')
  }, [onOpenChange, playFromGesture])

  const close = useCallback((action?: () => void) => {
    const node = dialog.current
    if (!node?.open || exitTimer.current !== undefined) return
    pending.current = action
    setClosing(true)
    play('close')
    exitTimer.current = window.setTimeout(() => node.close(), consoleDuration[reduced ? 'reduced' : 'centre-close'])
  }, [play, reduced])

  function finishClose() {
    window.clearTimeout(exitTimer.current)
    exitTimer.current = undefined
    setOpen(false)
    setClosing(false)
    onOpenChange(false)
    if (!hasCoveringOverlay(dialog.current)) {
      const target = opener.current?.isConnected && !opener.current.closest('[inert]') ? opener.current : trigger.current
      target?.focus({ preventScroll: true })
    }
    opener.current = undefined
    const action = pending.current
    pending.current = undefined
    action?.()
  }

  useEffect(() => () => window.clearTimeout(exitTimer.current), [])

  useLayoutEffect(() => {
    const node = dialog.current
    if (!open || !node) return
    let backwards = false
    const rememberDirection = (event: KeyboardEvent) => {
      if (event.key === 'Tab') backwards = event.shiftKey
    }
    const wrap = (toEnd: boolean) => {
      const stops = focusableElements(node).filter(stop => stop !== firstBoundary.current && stop !== lastBoundary.current)
      const next = toEnd ? stops.at(-1) : stops[0]
      next?.focus({ preventScroll: true })
    }
    const wrapIfOutside = () => {
      if (node.open && !node.contains(document.activeElement)) wrap(backwards)
    }
    const entering = (event: FocusEvent) => {
      if (!node.open) return
      if (event.target === firstBoundary.current) wrap(true)
      else if (event.target === lastBoundary.current) wrap(false)
      else wrapIfOutside()
    }
    const leaving = (event: FocusEvent) => {
      if (node.contains(event.target as Node) && !node.contains(event.relatedTarget as Node | null)) {
        // A null relatedTarget also covers Safari moving focus to browser chrome.
        queueMicrotask(wrapIfOutside)
      }
    }
    document.addEventListener('keydown', rememberDirection, true)
    document.addEventListener('focusin', entering, true)
    document.addEventListener('focusout', leaving, true)
    return () => {
      document.removeEventListener('keydown', rememberDirection, true)
      document.removeEventListener('focusin', entering, true)
      document.removeEventListener('focusout', leaving, true)
    }
  }, [open])

  useEffect(() => {
    if (!preferences.centreShortcut) return
    function shortcut(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'c' || event.defaultPrevented || event.isComposing || event.keyCode === 229
        || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
        || isEditableShortcutTarget(event) || hasCoveringOverlay(dialog.current)) return
      event.preventDefault()
      if (dialog.current?.open) close()
      else show()
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [close, preferences.centreShortcut, show])

  function openAction(id: (typeof actions)[number]['id']) {
    play('select')
    close(() => go(id, id === 'ledger' ? { state: { source: 'dashboard-insight', review: 'needs-review' } } : undefined))
  }

  function report<T>(read: { pending: boolean; error: boolean; data: T | null }, value: (data: T) => unknown): NoticeSource<never> {
    if (read.error) return { state: 'failed' }
    if (read.pending || !read.data) return { state: 'loading' }
    return { state: 'ready', value: value(read.data) as never }
  }

  function budgetSource(): NoticeSource<number> | undefined {
    if (!BUDGET_ENABLED) return undefined
    const { snapshot, readState, pending } = budget
    // Control Centre never starts a Budget read. A stale or unopened workspace isn't checked.
    if (readState === 'failed') return { state: 'failed' }
    if (readState === 'loading' || readState === 'preparing') return { state: 'loading' }
    if (!snapshot || readState !== 'ready') return { state: 'not-checked' }
    if (!snapshot.plan) return { state: 'ready', value: 0 }
    const preview = budgetPresentation(snapshot, readState, { pendingWrite: !!pending })
    if (preview.state === 'empty') return { state: 'ready', value: 0 }
    if (preview.phase !== 'current') return { state: 'not-checked' }
    // The current period is open but its checks didn't come back: say so rather than show nothing.
    if (!preview.checks) return { state: 'failed' }
    return { state: 'ready', value: preview.checks.active_count }
  }

  const notices: ConsoleNotices = open ? consoleNotices({
    budget: budgetSource(),
    bills: report(recurrence, data => billsDue(data.active, TODAY)),
    ledger: report(portfolio, data => data.attention_count),
    transfers: report(portfolio, data => data.transfer_leg_count),
    goals: report(planning, data => data.planningGoals.filter(goal => {
      const ring = goal.status === 'active' ? goalRing(data.planningGoals, goal.id, accounts) : undefined
      return ring && ring.valueCents >= ring.targetCents
    }).map(goal => goal.name)),
  }) : { state: 'checking' }

  // Four routes, Music, Quiet alerts and Sign out, plus Rest while the start screen is on.
  const actionCount = actions.length + 3 + (onRest ? 1 : 0)

  function openNotice(kind: NoticeKind) {
    play('select')
    const [view, options] = noticeTargets[kind]
    close(() => go(view, options))
  }

  function rest() {
    play('select')
    close(onRest)
  }

  function leave() {
    close(() => void signOut().catch(() => toast({ title: 'Sign out failed', sub: 'Try again from the Control Centre.', tone: 'error' })))
  }

  return <>
    <button ref={trigger} type="button" className="console-utility" aria-label="Control Centre"
      aria-haspopup="dialog" aria-expanded={open} aria-controls={dialogId}
      aria-keyshortcuts={preferences.centreShortcut ? 'C' : undefined} onClick={event => show(event.currentTarget)}>
      <Icon path="M4 6h16M4 12h16M4 18h16M9 3v6m6 0v6m-5 0v6" />
    </button>
    <dialog ref={dialog} id={dialogId} className="console-centre" aria-modal="true" aria-labelledby={headingId}
      data-closing={closing} onClose={finishClose}
      onCancel={event => { event.preventDefault(); close() }}
      onClick={event => { if (event.target === event.currentTarget) close() }}>
      <span ref={firstBoundary} className="sr-only" tabIndex={0} />
      <GlassSurface as="div" material="sheet" className="console-centre-sheet">
        <div className="console-centre-inner">
          <header className="console-centre-heading">
            <h2 id={headingId}>Control Centre</h2>
            <button ref={closeButton} type="button" className="console-utility" aria-label="Close Control Centre" onClick={() => close()}>
              <Icon path="m6 6 12 12M18 6 6 18" />
            </button>
          </header>
          <h3>Needs attention</h3>
          <NoticeStrip notices={notices} onOpen={openNotice} />
          <div className="console-centre-actions" role="group" aria-label="Quick actions"
            style={{ '--centre-action-count': actionCount, '--centre-action-phone-columns': Math.min(actionCount, 4) } as CSSProperties}>
            {actions.map(item => <button key={item.id} type="button" tabIndex={0} onClick={() => openAction(item.id)}>
              <Icon path={item.icon} /><span>{item.title}</span>
            </button>)}
            <button type="button" tabIndex={0} aria-label="Ambient music" aria-pressed={preferences.music} onClick={() => toggle('music')}>
              <Icon className="console-music-icon" path="M9 18V5l11-2v13M9 18a3 2-12 1 1-6 0 3 2-12 0 1 6 0Zm11-2a3 2-12 1 1-6 0 3 2-12 0 1 6 0Z" /><span>Music</span>
            </button>
            <button type="button" tabIndex={0} aria-pressed={quietAlerts} onClick={() => { play('select'); setQuietAlerts(!quietAlerts) }}>
              <Icon className="console-quiet-icon" path="M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l2 2H8M10 21h4M4 4l16 16" /><span>Quiet alerts</span>
            </button>
            {onRest && <button type="button" tabIndex={0} onClick={rest}>
              <Icon path="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /><span>Rest</span>
            </button>}
            <button type="button" tabIndex={0} onClick={leave}>
              <Icon path="M10 5H4v14h6m4-12 5 5-5 5m-6-5h11" /><span>Sign out</span>
            </button>
          </div>
        </div>
      </GlassSurface>
      <span ref={lastBoundary} className="sr-only" tabIndex={0} />
    </dialog>
  </>
}

function NoticeStrip({ notices, onOpen }: { notices: ConsoleNotices; onOpen: (kind: NoticeKind) => void }) {
  if (notices.state === 'checking') return <p className="console-centre-status" role="status" data-console-notices="checking">Checking for notices…</p>
  const gap = noticeGapText(notices.gaps)
  if (notices.state === 'clear') {
    // Only a source that failed stops this being "All caught up". An unopened Budget is named instead.
    const caughtUp = !notices.gaps.failed.length
    return <div className="console-centre-status" role="status" data-console-notices={caughtUp ? 'clear' : 'incomplete'}>
      <strong>{caughtUp ? 'All caught up' : 'Nothing to show'}</strong>
      <span>{caughtUp ? 'Nothing needs your attention right now.' : 'Nothing needs attention in what could be checked.'}{gap ? ` ${gap}` : ''}</span>
    </div>
  }
  return <>
    <FocusRow label="Notices" className="console-centre-cards">
      {notices.notices.map(item => <button key={item.kind} type="button" data-console-row-item data-console-notice={item.kind}
        onClick={() => onOpen(item.kind)}>
        <Icon path={noticeIcons[item.kind]} /><span>{item.label}</span><strong className="tabular-nums">{item.status}</strong>
        <small>{item.detail}</small>
      </button>)}
    </FocusRow>
    {(notices.total > notices.notices.length || gap) && <p className="console-centre-note" data-console-notice-note>
      {[notices.total > notices.notices.length ? `Showing ${notices.notices.length} of ${notices.total} notices.` : '', gap].filter(Boolean).join(' ')}
    </p>}
  </>
}

function Icon({ path, className }: { path: string; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={className}><path d={path} /></svg>
}
