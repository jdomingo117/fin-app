import { useConsoleDayLabel } from '../../hooks/useConsoleDayLabel'
import { Button } from '../Controls'
import { fmtCents } from '../../data'
import { type LinkedTxn, type TransferLinkRow } from './types'

export function LinkCard({
  link,
  accountName,
  busy,
  onDecide,
}: {
  link: TransferLinkRow
  accountName: (id: string) => string
  busy: boolean
  onDecide: (verdict: 'confirmed' | 'rejected') => void
}) {
  const { from_txn: from, to_txn: to } = link
  return (
    <div className="rounded-[12px] border border-[var(--hair)] p-4">
      {link.ambiguous && (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--color-warn)]/10 px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--color-warn)]">
          Multiple similar transfers found — check carefully
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TxnLeg txn={from} accountName={from ? accountName(from.account_id) : '—'} />
        <TxnLeg txn={to} accountName={to ? accountName(to.account_id) : '—'} />
      </div>
      {link.reasons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {link.reasons.map((r) => (
            <span
              key={r}
              className="rounded-[6px] bg-black/[0.04] px-2 py-0.5 text-[11.5px] font-medium text-muted"
            >
              {r}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3.5 flex flex-wrap gap-2">
        <Button onClick={() => onDecide('confirmed')} disabled={busy}>Confirm internal transfer</Button>
        <Button variant="ghost" onClick={() => onDecide('rejected')} disabled={busy}>Count as regular activity</Button>
      </div>
    </div>
  )
}

function TxnLeg({ txn, accountName }: { txn: LinkedTxn | null; accountName: string }) {
  const formatDay = useConsoleDayLabel()
  if (!txn) return <div className="rounded-[8px] border border-[var(--hair-soft)] p-2.5 text-[12.5px] text-muted">Missing leg</div>
  return (
    <div className="rounded-[8px] border border-[var(--hair-soft)] p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-ink">{accountName}</span>
        <span className="text-[12px] tabular-nums text-muted">{formatDay(txn.date)}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[12.5px] text-muted">{txn.original_description || '—'}</span>
        <span className={`flex-shrink-0 text-[13px] font-semibold tabular-nums ${txn.amount < 0 ? 'text-[var(--color-neg)]' : 'text-[var(--color-pos)]'}`}>
          {fmtCents(txn.amount)}
        </span>
      </div>
    </div>
  )
}
