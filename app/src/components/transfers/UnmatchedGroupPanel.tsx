import { useConsoleDayLabel } from '../../hooks/useConsoleDayLabel'
import { useReport } from '../../hooks/useReport'
import { transferBatch } from '../../lib/ledgerPage'
import ReportStatus from '../ReportStatus'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../Controls'
import { fmtCents } from '../../data'
import { groupActionDisclosure, untrackedTransferLabel } from '../../lib/transfers/reviewPresentation'
import { type UnmatchedGroup } from './types'

/** Same shape as SuggestedGroupPanel, adapted for lone legs: no ambiguous
 *  split (unmatched legs carry no score/reasons to be ambiguous about), and
 *  only the two verdicts decide_transfer_leg accepts. */
export function UnmatchedGroupPanel({
  group,
  accountName,
  expanded,
  onToggleExpand,
  deselected,
  onToggleSelect,
  busy,
  onBulkDecide,
  onSingleDecide,
  singleBusy,
}: {
  group: UnmatchedGroup
  accountName: (id: string) => string
  expanded: boolean
  onToggleExpand: () => void
  deselected: Set<string>
  onToggleSelect: (id: string) => void
  busy: boolean
  onBulkDecide: (txnIds: string[], verdict: 'rejected' | 'external') => void
  onSingleDecide: (txnId: string, verdict: 'rejected' | 'external') => void
  singleBusy: string | null
}) {
  const formatDay = useConsoleDayLabel()
  const batch = useReport(['transfer batch','unmatched',group.key,[...deselected]], tenant =>
    transferBatch(tenant,'unmatched',group.key,[...deselected]))
  if (!batch.data || batch.pending || batch.error) return <ReportStatus report={batch} label="Group selection" />
  const selection = batch.data
  const selectedIds = selection.selectedIds
  const selectedIdSet = new Set(selectedIds)
  const deferredIdSet = new Set(group.rows.filter(row => !selectedIdSet.has(row.id) && !deselected.has(row.id)).map(row => row.id))
  const disclosure = groupActionDisclosure(selectedIds, group.rows.map(row => row.id))
  const total = selection.amount

  // A single-row group needs no checkbox/select ceremony — the two buttons
  // act on that one transaction directly, same as the old flat list did.
  if (selection.total === 1) {
    const u = group.rows[0]
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[var(--hair)] px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 text-[12.5px]">
            <span className="font-semibold text-ink">{accountName(u.account_id)}</span>
            <span className="text-muted">{formatDay(u.date)}</span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="min-w-0 truncate text-[12.5px] text-muted">{u.original_description || '—'}</span>
            <span className={`flex-shrink-0 text-[13px] font-semibold tabular-nums ${u.amount < 0 ? 'text-[var(--color-neg)]' : 'text-[var(--color-pos)]'}`}>
              {fmtCents(u.amount)}
            </span>
          </div>
        </div>
        <div className="console-transfer-actions flex flex-shrink-0 gap-2">
          <button
            onClick={() => onSingleDecide(u.id, 'external')}
            disabled={singleBusy === u.id}
            className="micro min-h-11 rounded-lg border border-[var(--hair)] px-3 py-2 text-[12px] font-semibold text-ink transition hover:bg-black/[0.03] disabled:opacity-50"
          >
            {untrackedTransferLabel(u.amount)}
          </button>
          <button
            onClick={() => onSingleDecide(u.id, 'rejected')}
            disabled={singleBusy === u.id}
            className="micro min-h-11 rounded-lg border border-[var(--hair)] px-3 py-2 text-[12px] font-semibold text-muted transition hover:bg-black/[0.03] disabled:opacity-50"
          >
            Count as regular activity
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[12px] border border-[var(--hair)] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <button onClick={onToggleExpand} aria-expanded={expanded} className="flex min-h-11 min-w-0 items-center gap-2 text-left">
          <span className={`flex-shrink-0 text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
          <span className="min-w-0 truncate">
            <span className="font-semibold text-ink">{group.label}</span>
            <span className="ml-2 text-[12.5px] text-muted">
              {selection.total} transaction{selection.total === 1 ? '' : 's'} · {fmtCents(total)}
            </span>
          </span>
        </button>
        {selectedIds.length > 0 && (
          <div className="console-transfer-actions flex flex-shrink-0 flex-wrap gap-2">
            <Button variant="ghost" onClick={() => onBulkDecide(selectedIds, 'external')} disabled={busy}>
              Transfer to/from an untracked account ({selectedIds.length}){disclosure}
            </Button>
            <Button variant="ghost" onClick={() => onBulkDecide(selectedIds, 'rejected')} disabled={busy}>
              Count as regular activity ({selectedIds.length}){disclosure}
            </Button>
          </div>
        )}
      </div>

      {selection.deferredCount > 0 && (
        <div className="px-4 pb-2 text-[12px] text-muted" role="status">
          You can review up to 200 at a time. {selection.deferredCount} transaction{selection.deferredCount === 1 ? '' : 's'} will remain for the next action.
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
              {group.rows.map((u) => (
                <label
                  key={u.id}
                  className={`flex min-h-11 items-center gap-3 rounded-[10px] border border-[var(--hair)] px-3 py-2 text-[13px] transition ${deferredIdSet.has(u.id) ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:bg-black/[0.02]'}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIdSet.has(u.id)}
                    disabled={deferredIdSet.has(u.id)}
                    onChange={() => onToggleSelect(u.id)}
                    title={deferredIdSet.has(u.id) ? 'Deferred to the next 200-item batch' : undefined}
                    className="h-[15px] w-[15px] flex-shrink-0 accent-[var(--color-accent)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {accountName(u.account_id)}
                    {' · '}
                    {formatDay(u.date)}
                    {' · '}
                    <span className={u.amount < 0 ? 'text-[var(--color-neg)]' : 'text-[var(--color-pos)]'}>
                      {fmtCents(u.amount)}
                    </span>
                    {' · '}
                    {u.original_description || '—'}
                  </span>
                </label>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
