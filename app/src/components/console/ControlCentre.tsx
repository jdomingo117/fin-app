import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { keepDialogTabFocus } from '../../hooks/useDialogFocus'
import { usePortfolio } from '../../hooks/usePortfolio'
import { useView } from '../../router'
import { useConsolePreferences } from './ConsolePreferences'
import { FocusRow } from './FocusRow'
import { GlassSurface } from './GlassSurface'
import { consoleDuration, useConsoleReducedMotion } from './motion'
import { hasCoveringOverlay, isEditableShortcutTarget } from './useScenePause'
import './control-centre.css'

const actions = [
  { id: 'ledger', title: 'Ledger review', icon: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h4' },
  { id: 'transfers', title: 'Transfers', icon: 'M4 8h15l-4-4M20 16H5l4 4' },
  { id: 'ingestion', title: 'Ingestion', icon: 'M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4' },
  { id: 'settings', title: 'Settings', icon: 'M4 7h16M4 17h16M9 4v6m6 4v6' },
] as const

export function ControlCentre({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const { go, toast } = useView()
  const { signOut } = useAuth()
  const portfolio = usePortfolio()
  const { preferences, play, playFromGesture, toggle } = useConsolePreferences()!
  const reduced = useConsoleReducedMotion()
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
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

  function leave() {
    close(() => void signOut().catch(() => toast({ title: 'Sign out failed', sub: 'Try again from the Control Centre.' })))
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
      onKeyDown={event => keepDialogTabFocus(event, event.currentTarget)}
      onClick={event => { if (event.target === event.currentTarget) close() }}>
      <GlassSurface as="div" material="sheet" className="console-centre-sheet">
        <div className="console-centre-inner">
          <header className="console-centre-heading">
            <h2 id={headingId}>Control Centre</h2>
            <button ref={closeButton} type="button" className="console-utility" aria-label="Close Control Centre" onClick={() => close()}>
              <Icon path="m6 6 12 12M18 6 6 18" />
            </button>
          </header>
          <h3>Needs attention</h3>
          <FocusRow label="Attention cards" className="console-centre-cards">
            {actions.slice(0, 2).map(item => {
              const count = item.id === 'ledger' ? portfolio.data?.attention_count : portfolio.data?.transfer_leg_count
              const status = portfolio.pending ? 'Loading count' : count === undefined ? 'Count unavailable'
                : count === 0 ? 'All caught up' : `${count} to review`
              return <button key={item.id} type="button" data-console-row-item onClick={() => openAction(item.id)}>
                <Icon path={item.icon} /><span>{item.title}</span><strong className="tabular-nums">{status}</strong>
              </button>
            })}
          </FocusRow>
          <div className="console-centre-actions" role="group" aria-label="Quick actions">
            {actions.map(item => <button key={item.id} type="button" onClick={() => openAction(item.id)}>
              <Icon path={item.icon} /><span>{item.title}</span>
            </button>)}
            <button type="button" aria-label="Ambient music" aria-pressed={preferences.music} onClick={() => toggle('music')}>
              <Icon className="console-music-icon" path="M9 18V5l11-2v13M9 18a3 2-12 1 1-6 0 3 2-12 0 1 6 0Zm11-2a3 2-12 1 1-6 0 3 2-12 0 1 6 0Z" /><span>Music</span>
            </button>
            <button type="button" onClick={leave}>
              <Icon path="M10 5H4v14h6m4-12 5 5-5 5m-6-5h11" /><span>Sign out</span>
            </button>
          </div>
        </div>
      </GlassSurface>
    </dialog>
  </>
}

function Icon({ path, className }: { path: string; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={className}><path d={path} /></svg>
}
