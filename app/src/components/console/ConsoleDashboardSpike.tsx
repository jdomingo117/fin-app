import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { fmtCents, type Txn } from '../../data'
import { BUDGET_ENABLED } from '../../lib/budgetWorkspace'
import './console-dashboard.css'

const sections = [
  { id: 'dashboard', name: 'Overview', subtitle: 'Your financial position', icon: 'M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5h4v5' },
  { id: 'accounts', name: 'Accounts', subtitle: 'Balances and holdings', icon: 'M3 6h18v12H3zM3 10h18M7 15h4' },
  { id: 'income', name: 'Income', subtitle: 'Money coming in', icon: 'M4 19h16M7 14l5-5 3 3 5-6M16 6h4v4' },
  { id: 'expenses', name: 'Expenses', subtitle: 'Spending and recurring costs', icon: 'M6 7h12l-1 13H7zM9 8V6a3 3 0 0 1 6 0v2' },
  { id: 'budget', name: 'Budget', subtitle: 'Plan your spending', icon: 'M12 3v9h9M21 12a9 9 0 1 1-9-9' },
] as const

type SectionId = (typeof sections)[number]['id']
type Figure = { label: string; cents?: number; signed?: boolean }
type Props = {
  figures: Partial<Record<SectionId, Figure[]>>
  activity?: Txn[]
  motionOn: boolean
  covered: boolean
  open: (section: SectionId) => void
  openTransaction: (transaction: Txn) => void
}
type Ease = [number, number, number, number]
const enabledSections = sections.filter(({ id }) => id !== 'budget' || BUDGET_ENABLED)

function signedAmount(cents: number, signed: boolean) {
  const amount = fmtCents(cents)
  return signed && cents > 0 ? '+' + amount : amount.replace(/^-/, '−')
}

export default function ConsoleDashboardSpike({ figures, activity, motionOn, covered, open, openTransaction }: Props) {
  const [active, setActive] = useState(0)
  const [ambient, setAmbient] = useState(0)
  const [visible, setVisible] = useState(() => !document.hidden)
  const [timing, setTiming] = useState<{ dwell: number; enter: number; reduced: number; rise: number; ease: Ease }>()
  const root = useRef<HTMLElement>(null)
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const touchArmed = useRef<number | null>(null)
  const pointer = useRef<{ type: string; x: number; y: number } | null>(null)
  const lastHover = useRef<{ x: number; y: number } | null>(null)
  const reduce = useReducedMotion() || !motionOn
  const section = enabledSections[active]
  const sectionFigures = figures[section.id] ?? []
  const cards = activity?.filter(transaction => {
    if (section.id === 'dashboard') return true
    if (transaction.isTransfer || transaction.pending) return false
    if (section.id === 'income') return transaction.kind === 'income' && transaction.amount > 0
    if (section.id === 'expenses') return transaction.kind === 'expense' && transaction.amount < 0
    return false
  }).slice(0, 4)

  useLayoutEffect(() => {
    if (!root.current) return
    const styles = getComputedStyle(root.current)
    const value = (name: string) => parseFloat(styles.getPropertyValue(name))
    setTiming({
      dwell: value('--dur-dwell'),
      enter: value('--dur-enter') / 1000,
      reduced: value('--dur-reduced') / 1000,
      rise: value('--console-rise'),
      ease: styles.getPropertyValue('--ease-settle').match(/[\d.]+/g)!.map(Number) as Ease,
    })
  }, [])

  useEffect(() => {
    const syncVisibility = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', syncVisibility)
    return () => document.removeEventListener('visibilitychange', syncVisibility)
  }, [])

  useEffect(() => {
    if (active === ambient || !timing || !visible) return
    const timer = window.setTimeout(() => setAmbient(active), timing.dwell)
    return () => window.clearTimeout(timer)
  }, [active, ambient, timing, visible])

  function select(index: number) {
    touchArmed.current = null
    setActive(index)
  }

  function move(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const offset = event.key === 'ArrowLeft' ? -1 : 1
    const next = Math.min(enabledSections.length - 1, Math.max(0, active + offset))
    select(next)
    buttons.current[next]?.focus({ preventScroll: true })
  }

  function previewOnHover(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (event.pointerType !== 'mouse' || event.buttons) return
    const { clientX: x, clientY: y } = event
    if (lastHover.current?.x === x && lastHover.current?.y === y) return
    lastHover.current = { x, y }
    if (index !== active) select(index)
  }

  function activate(event: MouseEvent<HTMLButtonElement>, index: number) {
    const input = pointer.current
    pointer.current = null
    if (event.detail > 0 && input?.type === 'touch') {
      if (Math.hypot(event.clientX - input.x, event.clientY - input.y) > 12) return
      if (touchArmed.current !== index) {
        setActive(index)
        touchArmed.current = index
        return
      }
    }
    const stationaryHover = input?.type === 'mouse' && lastHover.current?.x === input.x && lastHover.current.y === input.y
    open(enabledSections[stationaryHover ? active : index].id)
  }

  return (
    <section ref={root} className="console-dashboard" aria-label="Dashboard section previews" data-reduced={!!reduce} data-paused={!visible || covered}>
      <div className="console-scene" aria-hidden="true">
        {enabledSections.map((item, index) => (
          <div key={item.id} data-section={item.id} className="console-ambient" data-current={index === ambient} />
        ))}
        <div className="console-rays" />
        <div className="console-beam" />
        <div className="console-grain" />
      </div>
      <div className="console-home">
        <div className="console-switcher">
          <div className="console-aperture" onClick={event => {
            // The tile can slide away before a user clicks a stationary pointer.
            if (event.detail && !event.defaultPrevented && !(event.target as Element).closest('button')
              && lastHover.current?.x === event.clientX && lastHover.current.y === event.clientY) open(section.id)
          }}>
            <div className="console-track" role="toolbar" aria-label="Sections" onKeyDown={move}>
              {enabledSections.map((item, index) => (
                <button
                  key={item.id}
                  ref={node => { buttons.current[index] = node }}
                  type="button"
                  className="console-section"
                  data-section={item.id}
                  data-active={index === active}
                  data-after={index > active}
                  style={{ '--offset': index - active } as React.CSSProperties}
                  aria-label={item.name}
                  aria-pressed={index === active}
                  tabIndex={index === active ? 0 : -1}
                  onFocus={event => {
                    if (event.currentTarget.matches(':focus-visible') && index !== active) select(index)
                  }}
                  onPointerEnter={event => previewOnHover(event, index)}
                  onPointerMove={event => previewOnHover(event, index)}
                  onPointerDown={event => {
                    pointer.current = { type: event.pointerType, x: event.clientX, y: event.clientY }
                  }}
                  onPointerCancel={() => { pointer.current = null }}
                  onClick={event => activate(event, index)}
                >
                  <span className="console-tile-art">
                    <span className="console-tile-rest" />
                    <span className="console-tile-active" />
                    <span className="console-tile-ring" />
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon} /></svg>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="console-selection">
            <div className="console-caption" key={section.id}>
              <span>{section.name}</span>
              <small>{section.subtitle}</small>
            </div>
            <div className="console-step">
              <button type="button" aria-label="Previous section" disabled={active === 0} onClick={() => select(active - 1)}>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m14 6-6 6 6 6" /></svg>
              </button>
              <button type="button" aria-label="Next section" disabled={active === enabledSections.length - 1} onClick={() => select(active + 1)}>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m10 6 6 6-6 6" /></svg>
              </button>
            </div>
          </div>
        </div>

        {timing && (
          <motion.div
            key={section.id}
            className="console-preview"
            data-section={section.id}
            initial={visible ? { opacity: 0, y: reduce ? 0 : timing.rise } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? timing.reduced : timing.enter, ease: timing.ease }}
          >
            <div className="console-summary">
              <h1>{section.name}</h1>
              {sectionFigures.length > 0 && <dl className="console-figures">
                {sectionFigures.map(({ label, cents, signed }) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd className="tabular-nums" data-sign={signed && cents ? (cents > 0 ? 'positive' : 'negative') : undefined}>
                      {cents === undefined ? 'Unavailable' : signedAmount(cents, !!signed)}
                    </dd>
                  </div>
                ))}
              </dl>}
              <button type="button" className="console-open" onClick={() => open(section.id)}>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
                {section.id === 'dashboard' ? 'View Dashboard details' : `Open ${section.name}`}
              </button>
            </div>
            {cards && cards.length > 0 && <div className="console-activity">
              <h2>Recent activity</h2>
              <div className="console-activity-row">
                {cards.map(transaction => (
                  <button type="button" className="console-activity-card" key={transaction.id} onClick={() => openTransaction(transaction)}>
                    <span>{transaction.cat || 'Transaction'}</span>
                    <strong className="tabular-nums" data-sign={transaction.amount > 0 ? 'positive' : transaction.amount < 0 ? 'negative' : undefined}>{signedAmount(transaction.amount, true)}</strong>
                    <span>{transaction.merchant || 'Transaction details'}</span>
                  </button>
                ))}
              </div>
            </div>}
          </motion.div>
        )}
      </div>
    </section>
  )
}
