import {expenseAmountRange} from '../lib/expenseAmountRange'
import { useMemo, useState } from 'react'
import Tile from './Tile'
import { ConsoleModule } from './console/ConsoleHub'
import Ledger from './Ledger'
import FiltersPopover from './FiltersPopover'
import { SearchInput, RemovableChip } from './Controls'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { expensePage, type LineCursor, type Facet } from '../lib/reports'
import { hydrateParents } from '../lib/ledgerPage'
import { useReport } from '../hooks/useReport'
import { useKeysetPage } from '../hooks/useKeysetPage'
import ReportStatus from './ReportStatus'
import { CATEGORY_TAXONOMY, EXPENSE_CATEGORIES } from '../data'
import TransactionCategoryDrawer from './TransactionCategoryDrawer'
import { useData } from '../contexts/DataContext'
import { useView } from '../router'

export default function TransactionsPanel({
  accounts, from, to, facets,
  categories,
  subcats,
  onCategories,
  onSubcats,
}: {
  accounts: string[]; from: string; to: string; facets: Facet[]
  categories: string[]
  subcats: string[]
  /** the caller prunes unreachable sub-cats (see `pruneSubcats`) */
  onCategories: (next: string[]) => void
  onSubcats: (next: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null)
  const debouncedQuery = useDebouncedValue(query, 180)
  const { refreshData } = useData()
  const { toast, theme } = useView()
  const consoleStyle = theme === 'console'

  // Category options (stable set) with per-category counts over the scoped rows.
  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>()
    facets.forEach(f => counts.set(f.category, (counts.get(f.category) ?? 0) + f.expense_count))
    return EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c, hint: String(counts.get(c) ?? 0) }))
  }, [facets])

  // Sub-category options cascade from the selected categories (all when none).
  const subcatOptions = useMemo(() => {
    const activeCats = categories.length ? categories : EXPENSE_CATEGORIES
    const seen = new Set<string>()
    const out: { value: string; label: string; hint: string }[] = []
    const counts = new Map<string, number>()
    const valuesByCategory = new Map<string, Set<string>>()
    facets.forEach((row) => {
      if (!row.subcategory || !activeCats.includes(row.category)) return
      counts.set(row.subcategory,(counts.get(row.subcategory) ?? 0) + row.expense_count)
      const values = valuesByCategory.get(row.category) ?? new Set<string>()
      values.add(row.subcategory); valuesByCategory.set(row.category, values)
    })
    activeCats.forEach((c) => [...(CATEGORY_TAXONOMY[c] ?? []), ...(valuesByCategory.get(c) ?? [])].forEach((s) => {
      if (!seen.has(s)) {
        seen.add(s)
        out.push({ value: s, label: s, hint: String(counts.get(s) ?? 0) })
      }
    }))
    return out
  }, [categories, facets])

  const filter = { accounts, from, to, categories, subcats, query: debouncedQuery, ...expenseAmountRange(amountMin,amountMax) }
  const page = useKeysetPage(filter, (tenant, cursor: LineCursor | null) => expensePage(tenant, filter, cursor), accounts.length > 0)
  const editor = useReport(['expense editor',selectedTransactionId], tenant => hydrateParents(tenant,[selectedTransactionId!]), !!selectedTransactionId)
  const amountActive = Boolean(amountMin || amountMax)
  const activeCount = categories.length + subcats.length + (amountActive ? 1 : 0)
  const anyChip = categories.length > 0 || subcats.length > 0 || amountActive
  const anyActive = anyChip || query.length > 0
  const amountLabel = amountMin && amountMax ? `$${amountMin}–$${amountMax}` : amountMin ? `≥ $${amountMin}` : amountMax ? `≤ $${amountMax}` : ''
  const shownRows = page.data?.rows ?? []
  const matching = page.data?.matching ?? 0
  const selectedTransaction = editor.data?.[0] ?? null
  const clearAmount = () => {
    setAmountMin('')
    setAmountMax('')
  }
  // Note this now clears the view's shared focus too, not just this list.
  const clearAll = () => {
    setQuery('')
    onCategories([])
    onSubcats([])
    clearAmount()
  }

  const refreshAfterEdit = async () => {
    await refreshData()
    toast({ title: 'Transaction updated', sub: 'Expenses analytics have been refreshed.' })
  }

  const content = <>
      {/* header — title + result count · search + filters */}
      <header className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          {!consoleStyle && <h3 className="font-display text-[16px] font-bold text-ink">Transactions</h3>}
          <span className="text-[13px] uppercase tracking-[0.06em] tabular-nums text-muted">
            Showing {shownRows.length} of {matching}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search merchant"
            ariaLabel="Search transactions"
            className="w-[190px]"
          />
          <FiltersPopover
            categoryOptions={categoryOptions}
            categories={categories}
            onCategories={onCategories}
            subcatOptions={subcatOptions}
            subcats={subcats}
            onSubcats={onSubcats}
            amountMin={amountMin}
            amountMax={amountMax}
            onAmountMin={setAmountMin}
            onAmountMax={setAmountMax}
            activeCount={activeCount}
            onReset={clearAll}
          />
        </div>
      </header>

      {/* active-filter chips */}
      {anyChip && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {categories.map((c) => (
            <RemovableChip key={`c-${c}`} onRemove={() => onCategories(categories.filter((x) => x !== c))}>
              {c}
            </RemovableChip>
          ))}
          {subcats.map((s) => (
            <RemovableChip key={`s-${s}`} onRemove={() => onSubcats(subcats.filter((x) => x !== s))}>
              {s}
            </RemovableChip>
          ))}
          {amountActive && <RemovableChip onRemove={clearAmount}>{amountLabel}</RemovableChip>}
          {anyActive && (
            <button
              type="button"
              onClick={clearAll}
              className="ml-0.5 rounded-[8px] px-2 py-1 text-[13px] font-semibold uppercase tracking-[0.05em] text-ink2 transition hover:bg-[var(--hair-soft)]"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {accounts.length > 0 && <ReportStatus report={page} label="Expense transactions" />}
      {selectedTransactionId && <ReportStatus report={editor} label="Transaction" />}
      {matching > 0 ? (
        <>
          <Ledger rows={shownRows} consoleStyle={consoleStyle} onEdit={(transaction) => setSelectedTransactionId(transaction.parentTransactionId ?? transaction.id)} />
          <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hair-soft)] pt-3">
            <span className="text-[13px] tabular-nums text-muted">Showing {shownRows.length} of {matching} transactions</span>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={page.page === 1} onClick={page.previous}>Previous</button>
              <span>Page {page.page}</span>
              <button type="button" disabled={!page.data?.next} onClick={() => page.data?.next && page.next(page.data.next)}>Next</button>
            </div>
          </footer>
        </>
      ) : facets.length === 0 ? (
        <div className="grid place-items-center py-12 text-center text-[12.5px] text-muted">
          No transactions in the selected period.
        </div>
      ) : (
        <div className="grid place-items-center gap-2 py-12 text-center">
          <span className="text-[12.5px] text-muted">No transactions match your filters.</span>
          <button
            type="button"
            onClick={clearAll}
            className="text-[12px] font-semibold text-accent-ink transition hover:opacity-70"
          >
            Clear filters
          </button>
        </div>
      )}
      <TransactionCategoryDrawer
        transaction={selectedTransaction}
        onClose={() => setSelectedTransactionId(null)}
        onChanged={refreshAfterEdit}
      />
  </>
  return consoleStyle ? <ConsoleModule title="Transactions" kind="flat" order={4}>{content}</ConsoleModule>
    : <Tile span={3} className="relative z-10">{content}</Tile>
}
