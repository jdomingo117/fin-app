import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { useConsolePreferences } from './ConsolePreferences'
import { FocusRing } from './FocusRing'

function arrowStep(key: string) {
  if (key === 'ArrowLeft') return -1
  if (key === 'ArrowRight') return 1
  return 0
}

/** A single tab stop for row items. Descendant controls keep their native Tab and arrow behavior. */
export function FocusRow({ label, className, children }: {
  label: string
  className: string
  children: ReactNode
}) {
  const row = useRef<HTMLDivElement>(null)
  const audio = useConsolePreferences()
  const selected = useRef<HTMLElement>()
  const items = () => Array.from(row.current?.querySelectorAll<HTMLElement>(
    '[data-console-row-item]:not(:disabled):not([aria-disabled="true"])',
  ) ?? []).filter(item => item.closest('[data-console-row]') === row.current)

  function setStop(nodes: HTMLElement[], next: HTMLElement | undefined) {
    selected.current = next
    nodes.forEach(item => { item.tabIndex = item === next ? 0 : -1 })
  }

  useLayoutEffect(() => {
    const sync = () => {
      const nodes = items()
      setStop(nodes, nodes.find(item => item === selected.current) ?? nodes[0])
    }
    sync()
    const observer = new MutationObserver(sync)
    if (row.current) observer.observe(row.current, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled'],
    })
    return () => observer.disconnect()
  }, [])

  function onArrow(event: KeyboardEvent<HTMLDivElement>) {
    const step = arrowStep(event.key)
    if (!step || event.defaultPrevented) return
    const nodes = items()
    const index = nodes.findIndex(item => item === event.target)
    if (index < 0) return
    event.preventDefault()
    const next = nodes[index + step]
    if (!next) return
    audio?.play('move', index + step)
    next.focus({ preventScroll: true })
  }

  return <div ref={row} className={className} role="group" aria-label={label} data-console-row
    onKeyDown={onArrow}
    onFocus={event => {
      const nodes = items()
      const selected = nodes.find(item => item === event.target)
      if (!selected) return
      setStop(nodes, selected)
      selected.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }}>
    {children}
  </div>
}

type SectionTile<Id extends string> = { id: Id; name: string; subtitle: string; icon: string }
const tapSlop = 12
const swipeDistance = 35

export function SectionFocusRow<Id extends string>({ items, activeId, onPreview, onActivate, restoreFocus }: {
  items: readonly SectionTile<Id>[]
  activeId: Id
  onPreview: (id: Id) => void
  onActivate: (id: Id) => void
  restoreFocus?: boolean
}) {
  const active = Math.max(0, items.findIndex(item => item.id === activeId))
  const current = items[active]
  const buttons = useRef(new Map<Id, HTMLButtonElement>())
  const lastHover = useRef<{ x: number; y: number } | null>(null)
  const pointer = useRef<{ type: string; x: number; y: number } | null>(null)
  const touchArmed = useRef<Id | null>(null)
  const suppressClick = useRef(false)

  useLayoutEffect(() => {
    if (restoreFocus) buttons.current.get(activeId)?.focus({ preventScroll: true })
    // Route return is the trigger. Pointer previews must never move DOM focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreFocus])

  function preview(id: Id) {
    touchArmed.current = null
    onPreview(id)
  }

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const step = arrowStep(event.key)
    if (!step || event.defaultPrevented) return
    event.preventDefault()
    const next = items[Math.max(0, Math.min(items.length - 1, active + step))].id
    preview(next)
    buttons.current.get(next)?.focus({ preventScroll: true })
  }

  function hover(event: PointerEvent<HTMLButtonElement>, id: Id) {
    if (event.pointerType !== 'mouse' || event.buttons) return
    const { clientX: x, clientY: y } = event
    if (lastHover.current?.x === x && lastHover.current?.y === y) return
    lastHover.current = { x, y }
    if (id !== activeId) preview(id)
  }

  function activate(event: MouseEvent<HTMLButtonElement>, id: Id) {
    const input = pointer.current
    pointer.current = null
    if (event.detail > 0 && suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (event.detail > 0 && input?.type === 'touch') {
      if (Math.hypot(event.clientX - input.x, event.clientY - input.y) > tapSlop) return
      if (touchArmed.current !== id) {
        onPreview(id)
        touchArmed.current = id
        return
      }
    }
    const samePointer = input?.type === 'mouse' && lastHover.current?.x === input.x && lastHover.current?.y === input.y
    onActivate(samePointer ? activeId : id)
  }

  return <div className="console-switcher">
    <FocusRing layer="glow" />
    <div className="console-aperture" onClick={event => {
      // Hover can move a tile away from a stationary pointer before it clicks.
      if (event.detail && !event.defaultPrevented && !(event.target as Element).closest('button')
        && lastHover.current?.x === event.clientX && lastHover.current.y === event.clientY) onActivate(activeId)
    }}>
      <div className="console-track" role="toolbar" aria-label="Sections" onKeyDown={move}
        onPointerDown={event => {
          suppressClick.current = false
          pointer.current = { type: event.pointerType, x: event.clientX, y: event.clientY }
        }}
        onPointerUp={event => {
          const input = pointer.current
          if (input?.type !== 'touch') return
          const dx = event.clientX - input.x
          if (Math.abs(dx) < swipeDistance || Math.abs(dx) < Math.abs(event.clientY - input.y)) return
          suppressClick.current = true
          preview(items[Math.max(0, Math.min(items.length - 1, active + (dx < 0 ? 1 : -1)))].id)
        }}>
        {items.map((item, index) => <button
          key={item.id}
          ref={node => { if (node) buttons.current.set(item.id, node); else buttons.current.delete(item.id) }}
          type="button"
          className="console-section"
          data-section={item.id}
          data-active={index === active}
          data-after={index > active}
          data-before={index < active}
          style={{ '--offset': index - active } as CSSProperties}
          aria-label={item.name}
          aria-pressed={index === active}
          tabIndex={index === active ? 0 : -1}
          onFocus={event => {
            if (!event.currentTarget.matches(':focus-visible')) return
            if (index !== active) preview(item.id)
            // The tile moves horizontally on focus. Use its stationary row for vertical scrolling.
            event.currentTarget.closest('.console-switcher')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          }}
          onPointerEnter={event => hover(event, item.id)}
          onPointerMove={event => hover(event, item.id)}
          onPointerCancel={() => { pointer.current = null }}
          onClick={event => activate(event, item.id)}
        >
          <span className="console-tile-art">
            <span className="console-tile-rest" />
            <span className="console-tile-active" />
            <FocusRing layer="edge" />
            <FocusRing layer="sweep" />
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon} /></svg>
          </span>
        </button>)}
      </div>
    </div>
    <div className="console-selection">
      <div className="console-caption" key={current.id}>
        <span>{current.name}</span>
        <small>{current.subtitle}</small>
      </div>
    </div>
  </div>
}
