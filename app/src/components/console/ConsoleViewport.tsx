import { DashboardReportsProvider } from './DashboardReports'
import { ConsolePreferencesProvider, useConsolePreferences } from './ConsolePreferences'
import { hasCoveringOverlay, isEditableShortcutTarget, useCoveringOverlay, useDocumentVisible } from './useScenePause'
import { AmbientBackground } from './AmbientBackground'
import { AnimatePresence, LayoutGroup, motion, PresenceContext, useIsPresent } from 'framer-motion'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useOutlet, useLocation, useNavigate } from 'react-router-dom'
import { useData } from '../../contexts/DataContext'
import { useView, type View } from '../../router'
import { enabledSections, type SectionId } from './sections'
import { PlanReportsProvider } from './PlanReports'
import { captureConsoleOrigin, type ConsoleEntry } from './ConsoleHub'
import { ControlCentre } from './ControlCentre'
import { WorkflowHub } from './WorkflowHub'
import { ConsoleStartScreen, writeConsoleStartSeen } from './ConsoleStartScreen'
import FoundationDemo from './FoundationDemo'
import { consoleDuration, consoleMotionStyle, consoleTransition, useConsoleReducedMotion } from './motion'

export type ConsoleOutlet = {
  home: boolean
  active: SectionId
  select: (id: SectionId) => void
  restoreFocus: boolean
  entry?: ConsoleEntry
  begin: (entry: ConsoleEntry) => void
  back: () => void
}

const hubTitles: Partial<Record<View, string>> = {
  dashboard: 'Overview', accounts: 'Accounts', income: 'Income', expenses: 'Expenses', budget: 'Budget',
  ledger: 'Ledger review', transfers: 'Transfers', ingestion: 'Ingestion', settings: 'Settings',
}

const workflowHubs: View[] = ['budget', 'ledger', 'ingestion', 'transfers', 'settings']
const expandedHubs: View[] = ['dashboard', 'income', 'expenses', 'accounts']

function sceneSection(view: View): SectionId {
  return enabledSections.find(section => section.id === view)?.id ?? 'dashboard'
}

function ConsoleRouteLayer({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  const present = useIsPresent()
  const layer = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (layer.current) layer.current.inert = !present
  }, [present])
  return <motion.div ref={layer} className="console-route-layer" aria-hidden={!present}
    exit={{ opacity: 0 }} transition={consoleTransition('hub', reduced)}>
    {/* Shared hero projection can continue during the fade. Only the route
        layer owns its exit lifecycle. */}
    <PresenceContext.Provider value={null}>{children}</PresenceContext.Provider>
  </motion.div>
}

export default function ConsoleViewport({ startEntrySeen }: { startEntrySeen: { current: boolean } }) {
  const visible = useDocumentVisible()
  return <ConsolePreferencesProvider visible={visible}>
    <DashboardReportsProvider><PlanReportsProvider>
      <ConsoleViewportContent visible={visible} startEntrySeen={startEntrySeen} />
    </PlanReportsProvider></DashboardReportsProvider>
  </ConsolePreferencesProvider>
}

function ConsoleViewportContent({ visible, startEntrySeen }: { visible: boolean; startEntrySeen: { current: boolean } }) {
  const { go, view, setTheme } = useView()
  const { profile } = useData()
  const location = useLocation()
  const navigate = useNavigate()
  const query = new URLSearchParams(location.search)
  const home = location.pathname === '/' || (view === 'dashboard' && query.get('hub') !== 'overview')
  const demo = import.meta.env.DEV && home && query.get('demo') === 'foundation'
  const [active, setActive] = useState<SectionId>(() => sceneSection(view))
  const [entry, setEntry] = useState<ConsoleEntry>()
  const [snapHue, setSnapHue] = useState(false)
  const [ambient, setAmbient] = useState(active)
  const [closing, setClosing] = useState(false)
  const [centreOpen, setCentreOpen] = useState(false)
  const overlay = useCoveringOverlay()
  const audio = useConsolePreferences()!
  const [showStart] = useState(() => home && !demo && !startEntrySeen.current && audio.preferences.startScreen)
  const [finishedStart, setFinishedStart] = useState(false)
  // Rest from Control Centre shows the start screen again, on Home only.
  const [resting, setResting] = useState(false)
  const restAfterBack = useRef(false)
  const startupVisible = ((showStart && !finishedStart) || resting) && home
  const paused = !visible || centreOpen || overlay || startupVisible
  const effectsTier = audio.effectsTier
  const [clock, setClock] = useState(() => new Date())
  const [restoreFocus, setRestoreFocus] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const hubHeading = useRef<HTMLHeadingElement>(null)
  const wasHome = useRef(home)
  const reduce = useConsoleReducedMotion()
  const designed = !home && expandedHubs.includes(view)
  const workflow = workflowHubs.includes(view)
  const outlet = useOutlet({ home, active, select, restoreFocus, entry, begin, back: requestBack } satisfies ConsoleOutlet)

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.consoleEffects = effectsTier
    return () => { delete root.dataset.consoleEffects }
  }, [effectsTier])

  useLayoutEffect(() => {
    if (!startupVisible) return
    startEntrySeen.current = true
    writeConsoleStartSeen(true)
  }, [startEntrySeen, startupVisible])

  const finishStartup = useCallback(() => {
    setFinishedStart(true)
    setResting(false)
    setRestoreFocus(true)
  }, [])

  function select(id: SectionId) {
    if (id !== active) audio.play('move', enabledSections.findIndex(section => section.id === id))
    setSnapHue(false)
    setActive(id)
  }

  function begin(next: ConsoleEntry) {
    audio.playFromGesture('select')
    setEntry({ ...next, origin: home && next.id === active ? captureConsoleOrigin(root.current) : undefined })
    setActive(next.id)
    if (ambient !== next.id) {
      setSnapHue(true)
      setAmbient(next.id)
    }
  }

  useEffect(() => {
    const clockTimer = window.setInterval(() => setClock(new Date()), 15000)
    return () => window.clearInterval(clockTimer)
  }, [])

  useEffect(() => {
    if (!home || active === ambient || paused) return
    const timer = window.setTimeout(() => setAmbient(active), consoleDuration.dwell)
    return () => window.clearTimeout(timer)
  }, [active, ambient, paused, home])

  useLayoutEffect(() => {
    if (home) {
      if (!wasHome.current) {
        if (!closing) audio.play('back')
        setRestoreFocus(true)
        setEntry(undefined)
      }
    } else {
      setRestoreFocus(false)
      hubHeading.current?.focus({ preventScroll: true })
    }
    wasHome.current = home
    setClosing(false)
    // A navigation guard can keep a hub open. Rest then waits for the next request.
    if (home && restAfterBack.current) setResting(true)
    restAfterBack.current = false
  }, [home, location.pathname])

  useEffect(() => {
    if (!closing) return
    const duration = consoleDuration[reduce ? 'reduced' : 'hub']
    const timer = window.setTimeout(() => {
      // The destination may be vetoed by a mounted workflow's navigation
      // guard. Finish the visual exit state even when the route stays here.
      setClosing(false)
      navigate('/dashboard', { replace: true })
    }, duration)
    return () => window.clearTimeout(timer)
  }, [closing, navigate, reduce])

  const centreChanged = useCallback((open: boolean) => {
    // A Rest that a navigation guard held back doesn't carry over to a later trip Home.
    if (open) restAfterBack.current = false
    setCentreOpen(open)
  }, [])

  function rest() {
    if (home) setResting(true)
    else {
      restAfterBack.current = true
      requestBack()
    }
  }

  function requestBack() {
    if (closing) return
    audio.play('back')
    setClosing(true)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || home || event.defaultPrevented || event.isComposing
        || isEditableShortcutTarget(event) || hasCoveringOverlay()
        || document.querySelector('[aria-expanded="true"]:focus')) return
      requestBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [home, closing, audio.play])

  const initials = profile.callsign?.trim().split(/\s+/).map(name => name.charAt(0)).slice(0, 2).join('').toUpperCase() || 'H'

  return (
    <div ref={root} className="console-viewport" data-reduced={reduce} data-reduce-effects={effectsTier === 'reduce'} data-effects-tier={effectsTier} data-paused={paused} data-snap-hue={snapHue}
      style={consoleMotionStyle}
      onClickCapture={event => { if (event.isTrusted && navigator.userActivation.isActive) audio.unlock() }}
      onKeyDownCapture={event => { if (event.isTrusted && navigator.userActivation.isActive && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey) audio.unlock() }}
      onPointerOver={event => {
        if (event.pointerType !== 'mouse' || !(event.target instanceof Element)) return
        const control = event.target.closest('button:not(:disabled), a[href], summary')
        if (!control || control.classList.contains('console-section')) return
        if (event.relatedTarget instanceof Node && control.contains(event.relatedTarget)) return
        audio.play('hover')
      }}>
      <AmbientBackground section={ambient} paused={paused} reduced={reduce} tier={effectsTier} />
      <header className="console-topbar" style={startupVisible ? { visibility: 'hidden' } : undefined}>
        <button type="button" className="console-brand" aria-label="Halcyon Home" onClick={() => { if (!home) requestBack() }}>
          <span aria-hidden="true" className="console-brand-letter" /><strong>HALCYON</strong>
        </button>
        <div className="console-utilities">
          <button type="button" className="console-toggle" aria-pressed="true" onClick={() => setTheme('classic')}>Console</button>
          <button type="button" className="console-utility console-sound"
            aria-label={!audio.soundAllowed ? 'Enable Console sound' : audio.preferences.muted ? 'Unmute Console sound' : 'Mute Console sound'}
            onClick={audio.toggleTopbarSound}>
            <VolumeIcon on={audio.soundAllowed && !audio.preferences.muted} />
          </button>
          <ControlCentre onOpenChange={centreChanged} onRest={audio.preferences.startScreen ? rest : undefined} />
          <button type="button" className="console-utility" aria-label="Settings" onClick={() => go('settings')}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.2 2.2m8.4 8.4 2.2 2.2m0-12.8-2.2 2.2m-8.4 8.4-2.2 2.2" /></svg>
          </button>
          <span className="console-avatar" aria-label={profile.callsign}>{initials}</span>
          <time className="console-clock tabular-nums">{clock.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' })}</time>
        </div>
      </header>
      <main className="console-main" data-home={home}>
        {!startupVisible && <LayoutGroup id="console-hub-entry">
          <AnimatePresence initial={false}>
            <ConsoleRouteLayer key={home ? 'home' : view} reduced={reduce}>
              {workflow ? <WorkflowHub title={hubTitles[view] ?? view} headingRef={hubHeading} closing={closing}
                entry={entry?.id === view ? entry : undefined} onBack={requestBack}>{outlet}</WorkflowHub> : <>
              {!home && !designed && <header className="console-hub-heading" data-initial-hero="compact">
                <button type="button" className="console-utility" aria-label="Back to Home" onClick={requestBack}>
                  <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m14 5-7 7 7 7" /></svg>
                </button>
                <h1 ref={hubHeading} tabIndex={-1}>{hubTitles[view]}</h1>
              </header>}
              <div className={home ? 'console-home-slot' : designed ? 'console-designed-hub' : 'console-hub'} data-closing={closing}>
                {demo ? <FoundationDemo /> : outlet}
              </div></>}
            </ConsoleRouteLayer>
          </AnimatePresence>
        </LayoutGroup>}
      </main>
      {startupVisible && <ConsoleStartScreen reduced={reduce} onFinish={finishStartup} onStart={() => audio.playFromGesture('start')} />}
    </div>
  )
}

function VolumeIcon({ on }: { on: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M11 5 6 9H3v6h3l5 4V5Z" />
    {on ? <path d="M15 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12" /> : <path d="m16 10 5 5m0-5-5 5" />}
  </svg>
}
