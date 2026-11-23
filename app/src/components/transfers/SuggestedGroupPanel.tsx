import { useView } from '../../router'
import { useConsoleDayLabel } from '../../hooks/useConsoleDayLabel'
import { useReport } from '../../hooks/useReport'
import { transferBatch } from '../../lib/ledgerPage'
import ReportStatus from '../ReportStatus'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../Controls'
import { fmtCents } from '../../data'
import { groupActionDisclosure } from '../../lib/transfers/reviewPresentation'
import { type TransferLinkRow, type SuggestedGroup } from './types'
import { LinkCard } from './LinkCard'

export function SuggestedGroupPanel({
  group,
  accountName,
  expanded,
  onToggleExpand,
  deselected,
  onToggleSelect,
  busy,
  onBulkDecide,
}: {
  group: SuggestedGroup
  accountName: (id: string) => string
  expanded: boolean
  onToggleExpand: () => void
  deselected: Set<string>
  onToggleSelect: (id: string) => void
  busy: boolean
  onBulkDecide: (linkIds: string[], verdict: 'confirmed' | 'rejected') => void
}) {
  const consoleStyle = useView().theme === 'console'
  const nonAmbiguous = group.links.filter((l) => !l.ambiguous)
  const ambiguous = group.links.filter((l) => l.ambiguous)
  const batch = useReport(['transfer batch','suggested',group.key,[...deselected]], tenant =>
    transferBatch(tenant,'suggested',group.key,[...deselected]))
  if (!batch.data || batch.pending || batch.error) return <ReportStatus report={batch} label="Group selection" />
  const selection = batch.data
  const selectedIds = selection.selectedIds
  const selectedIdSet = new Set(selectedIds)
  const deferredIdSet = new Set(group.links.filter(row => !selectedIdSet.has(row.id) && !deselected.has(row.id)).map(row => row.id))
  const disclosure = groupActionDisclosure(selectedIds, group.links.map(row => row.id))
  const total = selection.amount
  const decide = (verdict: 'confirmed' | 'rejected') => {
    const count = `${selectedIds.length} transfer${selectedIds.length === 1 ? '' : 's'}`
    if (consoleStyle && !window.confirm(verdict === 'confirmed'
      ? `Confirm ${count} as internal? Their amounts will be excluded from income and spending.`
      : `Count ${count} as regular activity? They will be included in income and spending where applicable.`)) return
    onBulkDecide(selectedIds, verdict)
  }

  return (
    <div className="rounded-[12px] border border-[var(--hair)] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <button type="button" data-console-record-label onClick={onToggleExpand} aria-expanded={expanded} className="flex min-h-11 min-w-0 items-center gap-2 text-left">
          <span className={`flex-shrink-0 text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
          <span className="min-w-0 truncate">
            <span className="font-semibold text-ink">
              {accountName(group.fromAccountId)} ↔ {accountName(group.toAccountId)}
            </span>
            <span className="ml-2 text-[12.5px] text-muted">
              {selection.total} transfer{selection.total === 1 ? '' : 's'} · {fmtCents(total)}
            </span>
          </span>
        </button>
        <div className="flex flex-shrink-0 flex-wrap gap-2">
          {selectedIds.length > 0 ? <>
            <Button onClick={() => decide('confirmed')} disabled={busy}>
              Confirm {selectedIds.length} internal transfer{selectedIds.length === 1 ? '' : 's'}{disclosure}
            </Button>
            <Button variant="ghost" onClick={() => decide('rejected')} disabled={busy}>
              Count {selectedIds.length} as regular activity{disclosure}
            </Button>
          </> : (
            <Button variant="ghost" onClick={onToggleExpand} disabled={busy}>
              {selection.ambiguousCount ? `Review ${selection.ambiguousCount} ambiguous match${selection.ambiguousCount === 1 ? '' : 'es'}` : 'Review selections'}
            </Button>
          )}
        </div>
      </div>

      <p className="px-4 pb-2 text-xs">{selectedIds.length} selected · {selection.deferredCount} deferred · {selection.ambiguousCount} ambiguous</p>
      {selection.ambiguousCount > 0 && (
        <div className="px-4 pb-2 text-[12px] text-muted">
          {selection.ambiguousCount} ambiguous match{selection.ambiguousCount === 1 ? '' : 'es'} excluded from bulk actions — review individually.
        </div>
      )}
      {selection.deferredCount > 0 && (
        <div className="px-4 pb-2 text-[12px] text-muted" role="status">
          The safe batch limit is 200. {selection.deferredCount} transfer{selection.deferredCount === 1 ? '' : 's'} will remain for the next action.
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid gap-2 border-t border-[var(--hair)] px-4 py-3">
              {nonAmbiguous.map((link) => (
                <GroupItemRow
                  key={link.id}
                  link={link}
                  selected={selectedIdSet.has(link.id)}
                  deferred={deferredIdSet.has(link.id)}
                  onToggle={() => onToggleSelect(link.id)}
                />
              ))}
              {ambiguous.map((link) => (
                <LinkCard
                  key={link.id}
                  link={link}
                  accountName={accountName}
                  busy={busy}
                  onDecide={(v) => onBulkDecide([link.id], v)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Compact opt-out row for a group's non-ambiguous members — no per-row
 *  decide buttons by design: uncheck what you don't want in this batch, act
 *  on the rest via the group header, and revisit anything left unchecked
 *  later (individually, or once it accumulates enough history of its own to
 *  cross the auto threshold on its own). */
function GroupItemRow({
  link,
  selected,
  deferred,
  onToggle,
}: {
  link: TransferLinkRow
  selected: boolean
  deferred: boolean
  onToggle: () => void
}) {
  const formatDay = useConsoleDayLabel()
  const from = link.from_txn
  return (
    <label className={`flex min-h-11 items-center gap-3 rounded-[10px] border border-[var(--hair)] px-3 py-2 text-[13px] transition ${deferred ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:bg-black/[0.02]'}`}>
      <input
        type="checkbox"
        checked={selected}
        disabled={deferred}
        onChange={onToggle}
        title={deferred ? 'Deferred to the next 200-item batch' : undefined}
        className="h-[15px] w-[15px] flex-shrink-0 accent-[var(--color-accent)]"
      />
      <span className="min-w-0 flex-1 truncate text-muted">
        {formatDay(from?.date)}
        {' · '}
        <span className={from && from.amount < 0 ? 'text-[var(--color-neg)]' : 'text-[var(--color-pos)]'}>
          {from ? fmtCents(from.amount) : ''}
        </span>
        {' · '}
        {from?.original_description || '—'}
      </span>
      <span className="flex flex-shrink-0 gap-1">
        {link.reasons.slice(0, 2).map((r) => (
          <span key={r} className="rounded-[6px] bg-black/[0.04] px-1.5 py-0.5 text-[11.5px] font-medium text-muted">
            {r}
          </span>
        ))}
      </span>
    </label>
  )
}
