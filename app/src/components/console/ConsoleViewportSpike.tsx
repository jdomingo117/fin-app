import { useReducedMotion } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useData } from '../../contexts/DataContext'
import { usePortfolio } from '../../hooks/usePortfolio'
import { useView, type View } from '../../router'
import { enabledSections, type SectionId } from './ConsoleDashboardSpike'

export type ConsoleOutlet = {
  home: boolean
  active: SectionId
  select: (id: SectionId) => void
  restoreFocus: boolean
}

const hubTitles: Partial<Record<View, string>> = {
  dashboard: 'Overview', accounts: 'Accounts', income: 'Income', expenses: 'Expenses', budget: 'Budget',
  ledger: 'Ledger review', transfers: 'Transfers', ingestion: 'Ingestion', settings: 'Settings',
}

const actions = [
  { id: 'ledger', title: 'Ledger review', icon: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h4' },
  { id: 'transfers', title: 'Transfers', icon: 'M4 8h15l-4-4M20 16H5l4 4' },
  { id: 'ingestion', title: 'Ingestion', icon: 'M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4' },
  { id: 'settings', title: 'Settings', icon: 'M4 7h16M4 17h16M9 4v6m6 4v6' },
] as const

function sceneSection(view: View): SectionId {
  return enabledSections.find(section => section.id === view)?.id ?? 'dashboard'
}

export default function ConsoleViewportSpike() {
  const { go, view, setTheme, motionOn, toast } = useView()
  const { profile } = useData()
  const { signOut } = useAuth()
  const portfolio = usePortfolio()
  const location = useLocation()
  const navigate = useNavigate()
  const home = view === 'dashboard' && new URLSearchParams(location.search).get('hub') !== 'overview'
  const [active, select] = useState<SectionId>(() => sceneSection(view))
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
  const reduce = !!useReducedMotion() || !motionOn

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
    if (active === ambient || !visible || centreOpen || !root.current) return
    const dwell = parseFloat(getComputedStyle(root.current).getPropertyValue('--dur-dwell'))
    const timer = window.setTimeout(() => setAmbient(active), dwell)
    return () => window.clearTimeout(timer)
  }, [active, ambient, visible, centreOpen])

  useLayoutEffect(() => {
    if (home) {
      if (!wasHome.current) setRestoreFocus(true)
    } else {
      setRestoreFocus(false)
      hubHeading.current?.focus({ preventScroll: true })
    }
    wasHome.current = home
    setClosing(false)
  }, [home, location.pathname])

  useEffect(() => {
    if (!closing || !root.current) return
    const duration = parseFloat(getComputedStyle(root.current).getPropertyValue(reduce ? '--dur-reduced' : '--dur-hub'))
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
    <div ref={root} className="console-viewport" data-reduced={reduce} data-paused={!visible || centreOpen}>
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
        {!home && <header className="console-hub-heading">
          <button type="button" className="console-utility" aria-label="Back to Home" onClick={() => setClosing(true)}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m14 5-7 7 7 7" /></svg>
          </button>
          <h1 ref={hubHeading} tabIndex={-1}>{hubTitles[view]}</h1>
        </header>}
        <div className={home ? 'console-home-slot' : 'console-hub'} data-closing={closing}>
          <Outlet context={{ home, active, select, restoreFocus } satisfies ConsoleOutlet} />
        </div>
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
          <div className="console-centre-actions">
            {actions.map(item => {
              const count = item.id === 'ledger' ? portfolio.data?.attention_count : item.id === 'transfers' ? portfolio.data?.transfer_leg_count : undefined
              return <button key={item.id} type="button" onClick={() => openAction(item.id)}>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d={item.icon} /></svg>
                <span>{item.title}</span>
                {count !== undefined && <small>{count} to review</small>}
              </button>
            })}
          </div>
          <button type="button" onClick={() => void leave()} className="console-signout">Sign out</button>
        </div>
      </dialog>
    </div>
  )
}
