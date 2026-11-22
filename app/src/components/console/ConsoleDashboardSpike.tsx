import { motion } from 'framer-motion'
import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import type { Account, Txn } from '../../data'
import { ConsoleFigureStrip, ConsoleHeadline, ConsoleHeroArt, consoleMoney, consoleRowKeys, type ConsoleArt, type ConsoleFigure } from './ConsoleHubSpike'
import { BUDGET_ENABLED } from '../../lib/budgetWorkspace'
import { consoleRise, useConsoleReducedMotion } from './motion'
import { FocusRing } from './FocusRing'
import './console-dashboard.css'

const sections = [
  { id: 'dashboard', name: 'Overview', subtitle: 'Your financial position', icon: 'M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5h4v5' },
  { id: 'accounts', name: 'Accounts', subtitle: 'Balances and holdings', icon: 'M3 6h18v12H3zM3 10h18M7 15h4' },
  { id: 'income', name: 'Income', subtitle: 'Money coming in', icon: 'M4 19h16M7 14l5-5 3 3 5-6M16 6h4v4' },
  { id: 'expenses', name: 'Expenses', subtitle: 'Spending and recurring costs', icon: 'M6 7h12l-1 13H7zM9 8V6a3 3 0 0 1 6 0v2' },
  { id: 'budget', name: 'Budget', subtitle: 'Plan your spending', icon: 'M12 3v9h9M21 12a9 9 0 1 1-9-9' },
] as const

export type SectionId = (typeof sections)[number]['id']
type Props = {
  figures: Partial<Record<SectionId, ConsoleFigure[]>>
  activity?: Txn[]
  accounts: Account[]
  period: string
  latestDate?: string
  trends: Partial<Record<SectionId, ConsoleArt>>
  activeId: SectionId
  selectSection: (section: SectionId) => void
  restoreFocus: boolean
  covered: boolean
  open: (section: SectionId) => void
  openTransaction: (transaction: Txn) => void
}
export const enabledSections = sections.filter(({ id }) => id !== 'budget' || BUDGET_ENABLED)

export default function ConsoleDashboardSpike({
  figures, activity, accounts, period, latestDate, trends, activeId, selectSection, restoreFocus,
  covered, open, openTransaction,
}: Props) {
  const active = Math.max(0, enabledSections.findIndex(section => section.id === activeId))
  const root = useRef<HTMLElement>(null)
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const touchArmed = useRef<number | null>(null)
  const pointer = useRef<{ type: string; x: number; y: number } | null>(null)
  const swallowTouchClick = useRef(false)
  const lastHover = useRef<{ x: number; y: number } | null>(null)
  const reduce = useConsoleReducedMotion()
  const section = enabledSections[active]
  const [headline, ...secondary] = figures[section.id] ?? []
  const cards = activity?.slice(0, 4)
  const isFlow = section.id === 'income' || section.id === 'expenses'

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
          <FocusRing layer="glow" />
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
                    <FocusRing layer="edge" />
                    <FocusRing layer="sweep" />
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

          <motion.div
            key={section.id}
            className="console-preview"
            data-section={section.id}
            {...consoleRise(reduce)}
          >
            <div className="console-hero">
              <div className="console-summary">
                <ConsoleHeadline id={section.id} label={`${section.name}${headline ? ` · ${headline.label}` : ''}`}
                  figure={headline} reduced={!!reduce} period={isFlow ? period : undefined} />
                {secondary.length > 0 && <ConsoleFigureStrip figures={secondary} />}
                {isFlow && latestDate && <p className="console-asof">Latest transaction · {latestDate}</p>}
              </div>
              <ConsoleHeroArt id={section.id} art={trends[section.id]} reduced={!!reduce} />
            </div>
            {section.id === 'accounts' && <div className="console-activity">
              <h2>Accounts</h2>
              {accounts.length ? <div className="console-activity-row" onKeyDown={consoleRowKeys}>
                {accounts.map(account => <button key={account.id} type="button" className="console-activity-card"
                  data-console-row-item onClick={() => open('accounts')}>
                  <FocusRing layer="sweep" />
                  <span className="console-card-emblem"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18v12H3zM3 10h18M7 15h4" /></svg></span>
                  <span className="console-card-category">{account.type}{account.institution ? ` · ${account.institution}` : ''}</span>
                  <strong className="tabular-nums" data-sign={account.balance < 0 ? 'negative' : undefined}>{consoleMoney(account.balance)}</strong>
                  <span className="console-card-title">{account.name}</span>
                </button>)}
              </div> : <p className="console-empty">No accounts to show.</p>}
            </div>}
            {(cards?.length || isFlow) ? <div className="console-activity">
              <h2>{isFlow ? 'Activity in this period' : 'Recent activity'}</h2>
              {cards?.length ? <div className="console-activity-row" onKeyDown={consoleRowKeys}>
                {cards.map(transaction => {
                  const category = transaction.cat || 'Transaction'
                  const merchant = transaction.merchant || 'Transaction details'
                  const amount = consoleMoney(transaction.amount, true)
                  return (
                    <button type="button" className="console-activity-card" key={transaction.id}
                      data-console-row-item aria-label={`${merchant}, ${category}, ${amount}`} onClick={() => openTransaction(transaction)}>
                      <FocusRing layer="sweep" />
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
    </section>
  )
}

function ActivityIcon({ transaction }: { transaction: Txn }) {
  const path = transaction.amount > 0 ? 'M4 16l6-6 4 4 6-8m-5 0h5v5'
    : transaction.cat?.toLowerCase().includes('grocer') ? 'M3 4h2l2 10h11l2-7H6m2 11h.01m9 0h.01'
    : transaction.cat?.toLowerCase().includes('transport') ? 'M4 14l2-6h12l2 6v5h-2v-2H6v2H4zm0 0h16'
    : 'M6 3h12v18l-3-2-3 2-3-2-3 2zm3 6h6m-6 4h6'
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d={path} /></svg>
}
