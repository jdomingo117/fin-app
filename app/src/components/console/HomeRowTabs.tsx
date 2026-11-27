import { useRef, type KeyboardEvent } from 'react'
import type { HomeRow, HomeRowId } from './sections'

export const homeRowPanelId = 'console-home-row'
export const homeRowTabId = (row: HomeRowId) => `console-home-row-tab-${row}`

/**
 * The visible control that switches Home between its rows. It's one tab stop:
 * the arrow keys, Home and End move between the rows and show each one as they go.
 */
export function HomeRowTabs({ rows, activeRow, onSelect }: {
  rows: readonly HomeRow[]
  activeRow: HomeRowId
  onSelect: (row: HomeRowId) => void
}) {
  const tabs = useRef(new Map<HomeRowId, HTMLButtonElement>())

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const index = rows.findIndex(row => row.id === activeRow)
    const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : undefined
    if (next === undefined || event.defaultPrevented) return
    event.preventDefault()
    // Stop the arrow reaching the tile row's own handler.
    event.stopPropagation()
    const row = rows[Math.max(0, Math.min(rows.length - 1, next))]
    if (row.id !== activeRow) onSelect(row.id)
    tabs.current.get(row.id)?.focus({ preventScroll: true })
  }

  return <div className="console-row-tabs" role="tablist" aria-label="Home rows" onKeyDown={move}>
    {rows.map(row => {
      const selected = row.id === activeRow
      return <button key={row.id} type="button" role="tab" id={homeRowTabId(row.id)} data-home-row={row.id}
        ref={node => { if (node) tabs.current.set(row.id, node); else tabs.current.delete(row.id) }}
        aria-selected={selected} aria-controls={homeRowPanelId} tabIndex={selected ? 0 : -1}
        onClick={() => { if (!selected) onSelect(row.id) }}>
        {row.name}
      </button>
    })}
  </div>
}
