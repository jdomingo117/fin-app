import { useState, type KeyboardEventHandler } from 'react'
import { fmtCents } from '../../data'
import { moneyEntry, parseBudgetMoney } from '../../lib/budgetWorkspace'
import { useView } from '../../router'

export default function BudgetAmountInput({ label, value, onChange, column, onKeyDown }: {
  label: string
  value: number
  onChange: (cents: number) => void
  column?: string
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
}) {
  const { theme } = useView()
  const [entry, setEntry] = useState(() => moneyEntry(value))
  const [focused, setFocused] = useState(false)
  const amount = parseBudgetMoney(entry)
  const formatted = theme === 'console' && !focused && amount !== null
  return <input className={`budget-input tabular-nums${column ? ' budget-sheet-input' : ''}`} aria-label={label}
    inputMode="decimal" required pattern={formatted ? undefined : '[0-9]+(\\.[0-9]{1,2})?'}
    value={formatted ? fmtCents(amount) : entry} data-sheet-input={column} onKeyDown={onKeyDown}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    onChange={event => {
      const input = event.currentTarget
      setEntry(input.value)
      const next = parseBudgetMoney(input.value)
      input.setCustomValidity(next === null ? 'Enter a positive amount or zero, using no more than two decimal places.' : '')
      if (next !== null) onChange(next)
    }} />
}
