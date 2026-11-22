import { AnimatePresence, LayoutGroup, motion, useIsPresent } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useOutlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useData } from '../../contexts/DataContext'
import { usePortfolio } from '../../hooks/usePortfolio'
import { useView, type View } from '../../router'
import { enabledSections, type SectionId } from './sections'
import { captureConsoleOrigin, type ConsoleEntry } from './ConsoleHubSpike'
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

const expandedHubs: View[] = ['dashboard', 'income', 'expenses', 'accounts']

const actions = [
  { id: 'ledger', title: 'Ledger review', icon: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h4' },
  { id: 'transfers', title: 'Transfers', icon: 'M4 8h15l-4-4M20 16H5l4 4' },
  { id: 'ingestion', title: 'Ingestion', icon: 'M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4' },
  { id: 'settings', title: 'Settings', icon: 'M4 7h16M4 17h16M9 4v6m6 4v6' },
] as const

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
    {children}
  </motion.div>
}

export default function ConsoleViewportSpike() {
  const { go, view, setTheme, toast } = useView()
  const { profile } = useData()
  const { signOut } = useAuth()
  const portfolio = usePortfolio()
  const location = useLocation()
  const navigate = useNavigate()
  const home = view === 'dashboard' && new URLSearchParams(location.search).get('hub') !== 'overview'
  const [active, setActive] = useState<SectionId>(() => sceneSection(view))
  const [entry, setEntry] = useState<ConsoleEntry>()
  const [snapHue, setSnapHue] = useState(false)
  const [ambient, setAmbient] = useState(active)
  const [closing, setClosing] = useState(false)
  const [centreOpen, setCentreOpen] = useState(false)
  const [visible, setVisible] = useState(() => !document.hidden)
  const [clock, setClock] = useState(() => new Date())
  const [restoreFocus, setRestoreFocus] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const hubHeading = useRef<HTMLHeadingElement>(null)
  const centre = useRef<HTMLDialogElement>(null)
  const wasHome = useRef(home)
  const reduce = useConsoleReducedMotion()
  const designed = !home && (view === 'dashboard' || view === 'income')
  const outlet = useOutlet({ home, active, select, restoreFocus, entry, begin, back: () => setClosing(true) } satisfies ConsoleOutlet)

  function select(id: SectionId) {
    setSnapHue(false)
    setActive(id)
  }

  function begin(next: ConsoleEntry) {
    setEntry({ ...next, origin: home && next.id === active ? captureConsoleOrigin(root.current) : undefined })
    setActive(next.id)
    if (ambient !== next.id) {
      setSnapHue(true)
      setAmbient(next.id)
    }
  }

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    const clockTimer = window.setInterval(() => setClock(new Date()), 15000)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(clockTimer)
    }
  }, [])

  useEffect(() => {
    if (!home || active === ambient || !visible || centreOpen) return
    const timer = window.setTimeout(() => setAmbient(active), consoleDuration.dwell)
    return () => window.clearTimeout(timer)
  }, [active, ambient, visible, centreOpen, home])

  useLayoutEffect(() => {
    if (home) {
      if (!wasHome.current) {
        setRestoreFocus(true)
        setEntry(undefined)
      }
    } else {
      setRestoreFocus(false)
      hubHeading.current?.focus({ preventScroll: true })
    }
    wasHome.current = home
    setClosing(false)
  }, [home, location.pathname])

  useEffect(() => {
    if (!closing) return
    const duration = consoleDuration[reduce ? 'reduced' : 'hub']
    const timer = window.setTimeout(() => {
      navigate('/dashboard', { replace: true })
    }, duration)
    return () => window.clearTimeout(timer)
  }, [closing, navigate, reduce])

  function openCentre() {
    if (centre.current?.open || document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')) return
    centre.current?.showModal()
    setCentreOpen(true)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.isComposing || event.repeat) return
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return
      if (event.key.toLowerCase() === 'c') {
        if (centre.current?.open) centre.current.close()
        else openCentre()
        return
      }
      if (event.key === 'Escape' && !home && !document.querySelector('[role="dialog"][aria-modal="true"], dialog[open], [aria-expanded="true"]:focus')) {
        setClosing(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [home])

  function openAction(id: (typeof actions)[number]['id']) {
    centre.current?.close()
    go(id, id === 'ledger' ? { state: { source: 'dashboard-insight', review: 'needs-review' } } : undefined)
  }

  async function leave() {
    centre.current?.close()
    try { await signOut() }
    catch { toast({ title: 'Sign out failed', sub: 'Try again from the Control Centre.' }) }
  }

  const initials = profile.callsign?.trim().split(/\s+/).map(name => name.charAt(0)).slice(0, 2).join('').toUpperCase() || 'H'

  return (
    <div ref={root} className="console-viewport" data-reduced={reduce} data-paused={!visible || centreOpen} data-snap-hue={snapHue}
      style={consoleMotionStyle}>
      <div className="console-scene" aria-hidden="true">
        {enabledSections.map(item => <div key={item.id} data-section={item.id} className="console-ambient" data-current={item.id === ambient} />)}
        <div className="console-rays" />
        <div className="console-beam" />
        <div className="console-grain" />
      </div>
      <header className="console-topbar">
        <button type="button" className="console-brand" aria-label="Halcyon Home" onClick={() => { if (!home) setClosing(true) }}>
          <span aria-hidden="true">H</span><strong>HALCYON</strong>
        </button>
        <div className="console-utilities">
          <button type="button" className="console-toggle" aria-pressed="true" onClick={() => setTheme('classic')}>Console</button>
          <button type="button" className="console-utility" aria-label="Control Centre" aria-haspopup="dialog" onClick={openCentre}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16M9 3v6m6 0v6m-5 0v6" /></svg>
          </button>
          <button type="button" className="console-utility" aria-label="Settings" onClick={() => go('settings')}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.2 2.2m8.4 8.4 2.2 2.2m0-12.8-2.2 2.2m-8.4 8.4-2.2 2.2" /></svg>
          </button>
          <span className="console-avatar" aria-label={profile.callsign}>{initials}</span>
          <time className="console-clock tabular-nums">{clock.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' })}</time>
        </div>
      </header>
      <main className="console-main" data-home={home}>
        <LayoutGroup id="console-hub-entry">
          <AnimatePresence initial={false}>
            <ConsoleRouteLayer key={home ? 'home' : view} reduced={reduce}>
              {!home && !designed && <header className="console-hub-heading" data-initial-hero={expandedHubs.includes(view) ? 'expanded' : 'compact'}>
                <button type="button" className="console-utility" aria-label="Back to Home" onClick={() => setClosing(true)}>
                  <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m14 5-7 7 7 7" /></svg>
                </button>
                <h1 ref={hubHeading} tabIndex={-1}>{hubTitles[view]}</h1>
              </header>}
              <div className={home ? 'console-home-slot' : designed ? 'console-designed-hub' : 'console-hub'} data-closing={closing}>
                {outlet}
              </div>
            </ConsoleRouteLayer>
          </AnimatePresence>
        </LayoutGroup>
      </main>
      <dialog ref={centre} className="console-centre" aria-labelledby="console-centre-title" onClose={() => setCentreOpen(false)}
        onClick={event => { if (event.target === event.currentTarget) centre.current?.close() }}>
        <div className="console-centre-sheet">
          <div className="console-centre-heading">
            <h2 id="console-centre-title">Control Centre</h2>
            <button type="button" className="console-utility" autoFocus aria-label="Close Control Centre" onClick={() => centre.current?.close()}>
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div className="console-centre-attention">
            <h3>Needs attention</h3>
            <div className="console-centre-cards">
              {actions.slice(0, 2).map(item => {
                const count = item.id === 'ledger' ? portfolio.data?.attention_count : portfolio.data?.transfer_leg_count
                return <button key={item.id} type="button" onClick={() => openAction(item.id)}>
                  <svg aria-hidden="true" viewBox="0 0 24 24"><path d={item.icon} /></svg>
                  <span>{item.title}</span>
                  <strong className="tabular-nums">{count === undefined ? 'Unavailable' : count === 0 ? 'All caught up' : `${count} to review`}</strong>
                </button>
              })}
            </div>
          </div>
          <div className="console-centre-actions" aria-label="Quick actions">
            {actions.map(item => <button key={item.id} type="button" aria-label={item.title} onClick={() => openAction(item.id)}>
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d={item.icon} /></svg>
              <span>{item.title}</span>
            </button>)}
            <button type="button" aria-label="Sign out" onClick={() => void leave()}>
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 5H4v14h6m4-12 5 5-5 5m-6-5h11" /></svg>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </dialog>
    </div>
  )
}
