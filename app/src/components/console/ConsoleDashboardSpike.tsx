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

export type SectionId = (typeof sections)[number]['id']
type Figure = { label: string; cents?: number; signed?: boolean }
type Props = {
  figures: Partial<Record<SectionId, Figure[]>>
  activity?: Txn[]
  period: string
  latestDate?: string
  trends: Partial<Record<SectionId, { label: string; values: number[] }>>
  activeId: SectionId
  selectSection: (section: SectionId) => void
  restoreFocus: boolean
  motionOn: boolean
  covered: boolean
  open: (section: SectionId) => void
  openTransaction: (transaction: Txn) => void
}
type Ease = [number, number, number, number]
export const enabledSections = sections.filter(({ id }) => id !== 'budget' || BUDGET_ENABLED)

function signedAmount(cents: number, signed: boolean) {
  const amount = fmtCents(cents)
  return signed && cents > 0 ? '+' + amount : amount.replace(/^-/, '−')
}

export default function ConsoleDashboardSpike({
  figures, activity, period, latestDate, trends, activeId, selectSection, restoreFocus,
  motionOn, covered, open, openTransaction,
}: Props) {
  const active = Math.max(0, enabledSections.findIndex(section => section.id === activeId))
  const [timing, setTiming] = useState<{ enter: number; reduced: number; rise: number; ease: Ease }>()
  const root = useRef<HTMLElement>(null)
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const touchArmed = useRef<number | null>(null)
  const pointer = useRef<{ type: string; x: number; y: number } | null>(null)
  const swallowTouchClick = useRef(false)
  const lastHover = useRef<{ x: number; y: number } | null>(null)
  const reduce = useReducedMotion() || !motionOn
  const section = enabledSections[active]
  const [headline, ...secondary] = figures[section.id] ?? []
  const cards = activity?.slice(0, 4)
  const isFlow = section.id === 'income' || section.id === 'expenses'

  useLayoutEffect(() => {
    if (!root.current) return
    const styles = getComputedStyle(root.current)
    const value = (name: string) => parseFloat(styles.getPropertyValue(name))
    setTiming({
      enter: value('--dur-enter') / 1000,
      reduced: value('--dur-reduced') / 1000,
      rise: value('--console-rise'),
      ease: styles.getPropertyValue('--ease-settle').match(/[\d.]+/g)!.map(Number) as Ease,
    })
  }, [])

  useEffect(() => {
    if (restoreFocus) root.current?.querySelector<HTMLButtonElement>('.console-section[data-active="true"]')?.focus({ preventScroll: true })
  }, [restoreFocus])

  function select(index: number) {
    touchArmed.current = null
    selectSection(enabledSections[index].id)
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
    if (event.detail > 0 && swallowTouchClick.current) {
      swallowTouchClick.current = false
      return
    }
    if (event.detail > 0 && input?.type === 'touch') {
      if (Math.hypot(event.clientX - input.x, event.clientY - input.y) > 12) return
      if (touchArmed.current !== index) {
        selectSection(enabledSections[index].id)
        touchArmed.current = index
        return
      }
    }
    const stationaryHover = input?.type === 'mouse' && lastHover.current?.x === input.x && lastHover.current.y === input.y
    open(enabledSections[stationaryHover ? active : index].id)
  }

  return (
    <section ref={root} className="console-home" aria-label="Dashboard section previews" data-paused={covered}>
        <div className="console-switcher">
          <div className="console-aperture" onClick={event => {
            // The tile can slide away before a user clicks a stationary pointer.
            if (event.detail && !event.defaultPrevented && !(event.target as Element).closest('button')
              && lastHover.current?.x === event.clientX && lastHover.current.y === event.clientY) open(section.id)
          }}>
            <div className="console-track" role="toolbar" aria-label="Sections" onKeyDown={move}
              onPointerDown={event => {
                swallowTouchClick.current = false
                pointer.current = { type: event.pointerType, x: event.clientX, y: event.clientY }
              }}
              onPointerUp={event => {
              const input = pointer.current
              if (input?.type !== 'touch') return
              const dx = event.clientX - input.x
              if (Math.abs(dx) < 35 || Math.abs(dx) < Math.abs(event.clientY - input.y)) return
              swallowTouchClick.current = true
              select(Math.max(0, Math.min(enabledSections.length - 1, active + (dx < 0 ? 1 : -1))))
            }}>
              {enabledSections.map((item, index) => (
                <button
                  key={item.id}
                  ref={node => { buttons.current[index] = node }}
                  type="button"
                  className="console-section"
                  data-section={item.id}
                  data-active={index === active}
                  data-after={index > active}
                  data-before={index < active}
                  style={{ '--offset': index - active } as React.CSSProperties}
                  aria-label={item.name}
                  aria-pressed={index === active}
                  tabIndex={index === active ? 0 : -1}
                  onFocus={event => {
                    if (event.currentTarget.matches(':focus-visible') && index !== active) select(index)
                  }}
                  onPointerEnter={event => previewOnHover(event, index)}
                  onPointerMove={event => previewOnHover(event, index)}
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
          </div>
        </div>

        {timing && (
          <motion.div
            key={section.id}
            className="console-preview"
            data-section={section.id}
            initial={{ opacity: 0, y: reduce ? 0 : timing.rise }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? timing.reduced : timing.enter, ease: timing.ease }}
          >
            <div className="console-hero">
              <div className="console-summary">
                <p className="console-hero-label">{section.name}{headline ? ` · ${headline.label}` : ''}</p>
                {isFlow && <p className="console-period">{period}</p>}
                <h1 className={headline?.cents === undefined ? 'console-unavailable' : 'tabular-nums'}>
                  {headline?.cents === undefined ? (section.id === 'budget' ? section.name : 'Unavailable') : signedAmount(headline.cents, !!headline.signed)}
                </h1>
                {secondary.length > 0 && <dl className="console-figures">
                  {secondary.map(({ label, cents, signed }) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd className="tabular-nums" data-sign={signed && cents ? (cents > 0 ? 'positive' : 'negative') : undefined}>
                        {cents === undefined ? 'Unavailable' : signedAmount(cents, !!signed)}
                      </dd>
                    </div>
                  ))}
                </dl>}
                {isFlow && latestDate && <p className="console-asof">Latest transaction · {latestDate}</p>}
              </div>
              <TrendOrb trend={trends[section.id]} />
            </div>
            {(cards?.length || isFlow) ? <div className="console-activity">
              <h2>{isFlow ? 'Activity in this period' : 'Recent activity'}</h2>
              {cards?.length ? <div className="console-activity-row">
                {cards.map(transaction => {
                  const category = transaction.cat || 'Transaction'
                  const merchant = transaction.merchant || 'Transaction details'
                  const amount = signedAmount(transaction.amount, true)
                  return (
                    <button type="button" className="console-activity-card" key={transaction.id}
                      aria-label={`${merchant}, ${category}, ${amount}`} onClick={() => openTransaction(transaction)}>
                      <span className="console-card-emblem"><ActivityIcon transaction={transaction} /></span>
                      <span className="console-card-category">{category}</span>
                      <strong className="tabular-nums" data-sign={transaction.amount > 0 ? 'positive' : transaction.amount < 0 ? 'negative' : undefined}>{amount}</strong>
                      <span className="console-card-title">{merchant}</span>
                    </button>
                  )
                })}
              </div> : <p className="console-empty">{activity ? 'No matching transactions in the recent preview.' : 'Activity is unavailable.'}</p>}
            </div> : null}
          </motion.div>
        )}
    </section>
  )
}

function TrendOrb({ trend }: { trend?: { label: string; values: number[] } }) {
  const values = trend?.values ?? []
  const low = Math.min(...values)
  const span = Math.max(...values) - low
  const points = values.length > 1 ? values.map((value, i) => {
    const x = 15 + i * 130 / (values.length - 1)
    const y = span ? 96 - (value - low) * 38 / span : 79
    return `${x},${y}`
  }).join(' ') : undefined
  return (
    <figure className="console-orb" aria-hidden={!points}>
      <div className="console-orb-core" aria-hidden="true" />
      <svg aria-hidden="true" viewBox="0 0 160 160" fill="none">
        <circle cx="80" cy="80" r="75" stroke="currentColor" strokeOpacity=".45" strokeDasharray="1 4" />
        <circle cx="80" cy="80" r="68" stroke="currentColor" strokeOpacity=".25" />
        <circle cx="80" cy="80" r="63" stroke="currentColor" strokeOpacity=".6" strokeWidth="2" />
        {points && <>
          <path className="console-orb-area" d={`M15,110 L${points.replaceAll(' ', ' L')} L145,110 Z`} />
          <polyline className="console-orb-line" points={points} />
        </>}
      </svg>
      {points && <figcaption className="sr-only">
        {trend?.label}. First value {fmtCents(values[0])}. Last value {fmtCents(values[values.length - 1])}.
      </figcaption>}
    </figure>
  )
}

function ActivityIcon({ transaction }: { transaction: Txn }) {
  const path = transaction.amount > 0 ? 'M4 16l6-6 4 4 6-8m-5 0h5v5'
    : transaction.cat?.toLowerCase().includes('grocer') ? 'M3 4h2l2 10h11l2-7H6m2 11h.01m9 0h.01'
    : transaction.cat?.toLowerCase().includes('transport') ? 'M4 14l2-6h12l2 6v5h-2v-2H6v2H4zm0 0h16'
    : 'M6 3h12v18l-3-2-3 2-3-2-3 2zm3 6h6m-6 4h6'
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d={path} /></svg>
}
