import { useConsoleDayLabel } from '../hooks/useConsoleDayLabel'
import { useAuth } from '../contexts/AuthContext'
import { useQueuePage } from '../lib/queuePage'
import { overflowSummary as readOverflow } from '../lib/ledgerPage'
import { useReport } from '../hooks/useReport'
import { QueueNavigation } from './QueueNavigation'
import ReportStatus from './ReportStatus'
import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabaseClient'
import { useData } from '../contexts/DataContext'
import { Button } from './Controls'
import { fmtCents } from '../data'
import { normalizeMerchant } from '../lib/csv/normalizeMerchant'
import {

  TRANSFER_DECISION_BATCH_LIMIT, toggleReviewExclusion,
} from '../lib/transfers/reviewPresentation'
import InvestmentCashLinker from './InvestmentCashLinker'
import { OperationStatusPanel } from './OperationStatus'
import { WorkflowSkeleton, WorkflowStatus } from './console/WorkflowHub'
import { ConsoleHeroArt } from './console/ConsoleHub'
import { useConsoleReducedMotion } from './console/motion'
import { useView } from '../router'

import { type TransferLinkRow, type UnmatchedRow, type OverflowRow, type SuggestedGroup, type UnmatchedGroup } from './transfers/types'
import { SuggestedGroupPanel } from './transfers/SuggestedGroupPanel'
import { UnmatchedGroupPanel } from './transfers/UnmatchedGroupPanel'
import { LinkCard } from './transfers/LinkCard'

/** Groups by normalized merchant identity, same convention as merchant_rules
 *  and every other ingestion cache — e.g. every "Round Up" leg that slips
 *  through (a merchant whose text happens to collide, not the sweep itself,
 *  which is excluded from the candidate pool entirely at ingest) collapses
 *  into one reviewable batch instead of N identical rows. */
function groupUnmatched(unmatched: UnmatchedRow[]): UnmatchedGroup[] {
  const groups = new Map<string, UnmatchedGroup>()
  for (const row of unmatched) {
    const { key, display } = normalizeMerchant(row.original_description)
    if (!groups.has(key)) groups.set(key, { key, label: display, rows: [] })
    groups.get(key)!.rows.push(row)
  }
  return [...groups.values()].sort((a, b) => b.rows.length - a.rows.length)
}

/** Groups by the unordered account pair — a sweep that occasionally reverses
 *  direction (A→B one fortnight, B→A the next) is still one relationship to
 *  the user, not two. Mirrors pairHistoryKey() in lib/transfers/match.ts.
 *  Links missing either leg (shouldn't happen — the matcher's hard gates
 *  require both) are dropped from grouping and rendered individually as a
 *  fallback so nothing silently disappears. */
function groupSuggested(suggested: TransferLinkRow[]): { groups: SuggestedGroup[]; groupless: TransferLinkRow[] } {
  const groups = new Map<string, SuggestedGroup>()
  const groupless: TransferLinkRow[] = []
  for (const link of suggested) {
    if (!link.from_txn || !link.to_txn) {
      groupless.push(link)
      continue
    }
    const a = link.from_txn.account_id
    const b = link.to_txn.account_id
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    if (!groups.has(key)) groups.set(key, { key, fromAccountId: a, toAccountId: b, links: [] })
    groups.get(key)!.links.push(link)
  }
  return { groups: [...groups.values()].sort((x, y) => y.links.length - x.links.length), groupless }
}

/**
 * Same-Day Osko Linker (SRD §6.E) — the review surface for internal-transfer
 * detection. Nothing here rewrites a transaction's category; a decision is
 * durable state layered on top (transfer_decisions, via decide-transfer),
 * which is what lets a rejected suggestion stay rejected across re-imports.
 */
export default function OskoLinker() {
  const { user, tenantId } = useAuth()
  return <TransferQueues key={JSON.stringify([user?.id,tenantId])} />
}

function TransferQueues() {
  const formatDay = useConsoleDayLabel()
  const consoleStyle = useView().theme === 'console'
  const reduced = useConsoleReducedMotion()
  const { accounts, refreshData } = useData()
  const suggestions = useQueuePage<TransferLinkRow>('transfer_links','score',{ state:'suggested' })
  const automatic = useQueuePage<TransferLinkRow>('transfer_links','score',{ state:'auto' })
  const legs = useQueuePage<UnmatchedRow>('transactions_analytic','date',{ transfer_state:'unmatched' })
  const buckets = useQueuePage<OverflowRow>('transfer_match_overflow','amount_cents',{})
  const totals = useReport('transfer overflow',readOverflow)
  const unmatchedTotal = legs.data?.count ?? 0
  const unmatched = legs.data?.rows ?? []
  const suggested = suggestions.data?.rows ?? []
  const auto = automatic.data?.rows ?? []
  const overflow = buckets.data?.rows ?? []
  const [rescanning, setRescanning] = useState(false)
  const [deciding, setDeciding] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [showAuto, setShowAuto] = useState(false)
  const [showOverflow, setShowOverflow] = useState(false)
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  // A link is selected-by-default (opt-out, not opt-in) unless ambiguous —
  // ambiguous links are never auto-selected regardless of this set, so a
  // blind "select all" can't rubber-stamp a coin-flip pair. Stale ids left
  // behind after a decide are harmless — they just stop matching anything.
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const [batchBusy, setBatchBusy] = useState<string | null>(null)
  // Separate from the suggested-pairs state above — different id space
  // (txn ids, not link ids) and a different queue entirely, kept apart so
  // toggling one never has spooky action on the other.
  const [unmatchedExpandedGroups, setUnmatchedExpandedGroups] = useState<Set<string>>(new Set())
  const [unmatchedDeselected, setUnmatchedDeselected] = useState<Set<string>>(new Set())
  const [unmatchedBatchBusy, setUnmatchedBatchBusy] = useState<string | null>(null)
  const [investmentRefreshKey, setInvestmentRefreshKey] = useState(0)

  const namesById = useMemo(() => new Map(accounts.map(account => [account.id, account.name])), [accounts])
  const accountName = (id: string) => namesById.get(id) ?? 'Unknown account'

  const rescan = async () => {
    setRescanning(true)
    setError('')
    try {
      const { error: fnErr } = await supabase.functions.invoke('link-transfers', { body: { scope: 'all' } })
      if (fnErr) throw fnErr
      setInvestmentRefreshKey((value) => value + 1)
      await refreshData()
    } catch {
      setError('Rescan failed — please try again.')
    } finally {
      setRescanning(false)
    }
  }

  const decide = async (linkId: string, verdict: 'confirmed' | 'rejected' | 'external') => {
    setDeciding(linkId)
    setError('')
    try {
      const { error: fnErr } = await supabase.functions.invoke('decide-transfer', {
        body: { link_id: linkId, verdict },
      })
      if (fnErr) throw fnErr
      await refreshData()
    } catch {
      setError('Could not save that decision — please try again.')
    } finally {
      setDeciding(null)
    }
  }

  const decideLeg = async (txnId: string, verdict: 'rejected' | 'external') => {
    setDeciding(txnId)
    setError('')
    try {
      const { error: fnErr } = await supabase.functions.invoke('decide-transfer', {
        body: { txn_id: txnId, verdict },
      })
      if (fnErr) throw fnErr
      await refreshData()
    } catch {
      setError('Could not save that decision — please try again.')
    } finally {
      setDeciding(null)
    }
  }

  const decideBatch = async (groupKey: string, linkIds: string[], verdict: 'confirmed' | 'rejected' | 'external') => {
    if (linkIds.length === 0) return
    if (linkIds.length > TRANSFER_DECISION_BATCH_LIMIT) {
      setError(`Choose no more than ${TRANSFER_DECISION_BATCH_LIMIT} transfers in one batch.`)
      return
    }
    setBatchBusy(groupKey)
    setError('')
    try {
      const { error: fnErr } = await supabase.functions.invoke('decide-transfer', {
        body: { link_ids: linkIds, verdict },
      })
      if (fnErr) throw fnErr
      await refreshData()
    } catch {
      setError('Could not save that batch — please try again.')
    } finally {
      setBatchBusy(null)
    }
  }

  const decideLegBatch = async (groupKey: string, txnIds: string[], verdict: 'rejected' | 'external') => {
    if (txnIds.length === 0) return
    if (txnIds.length > TRANSFER_DECISION_BATCH_LIMIT) {
      setError(`Choose no more than ${TRANSFER_DECISION_BATCH_LIMIT} transactions in one batch.`)
      return
    }
    setUnmatchedBatchBusy(groupKey)
    setError('')
    try {
      const { error: fnErr } = await supabase.functions.invoke('decide-transfer', {
        body: { txn_ids: txnIds, verdict },
      })
      if (fnErr) throw fnErr
      await refreshData()
    } catch {
      setError('Could not save that batch — please try again.')
    } finally {
      setUnmatchedBatchBusy(null)
    }
  }

  const toggleGroupExpanded = (key: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const toggleSelected = (id: string) =>
    setDeselected(prev => toggleReviewExclusion(prev,id))

  const toggleUnmatchedGroupExpanded = (key: string) =>
    setUnmatchedExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const toggleUnmatchedSelected = (id: string) =>
    setUnmatchedDeselected(prev => toggleReviewExclusion(prev,id))

  const reports = [suggestions, automatic, legs, buckets, totals]
  if (reports.some(r => r.error)) return <>{consoleStyle&&<WorkflowStatus label="To review">Unavailable</WorkflowStatus>}{reports.filter(r => r.error).map((r,i) => <ReportStatus key={i} report={r} label="Transfer review" />)}</>
  if (reports.some(r => r.pending && !r.data)) return consoleStyle
    ? <WorkflowSkeleton label="Loading transfer suggestions" /> : <OperationStatusPanel state="working" title="Loading transfer suggestions" description="Fetching the current bounded review queue. No transfer decision is being changed." />

  const outstanding = (suggestions.data?.count ?? 0) + unmatchedTotal
  const status = consoleStyle && <WorkflowStatus label="To review">{outstanding}</WorkflowStatus>
  const { groups: suggestedGroups, groupless } = groupSuggested(suggested)
  const overflowSummary = totals.data ?? { bucketCount: 0, legCount: 0, suggestedPairCount: 0 }

  const scan = <Button variant="ghost" onClick={rescan} disabled={rescanning}>
    {rescanning ? 'Scanning…' : 'Scan your ledger for internal transfers'}
  </Button>
  const emptyMessage = <p className="text-[13px] text-muted">
    No internal transfers pending review. Import statements from more than one account
    to start finding them, or scan what's already in your ledger.
  </p>
  const cleared = consoleStyle && outstanding === 0 && !overflow.length ? <div className="console-transfer-cleared">
    <div aria-hidden="true"><ConsoleHeroArt id="dashboard" art={{ label: 'All reconciled', percent: 100 }} reduced={reduced} /></div>
    <h3 className="console-module-title" data-module-title>All reconciled</h3>
    {emptyMessage}
    <div>{scan}</div>
  </div> : undefined

  if (!suggestions.data?.count && !automatic.data?.count && unmatchedTotal === 0 && overflow.length === 0) {
    return (
      <div className="grid gap-3">
        <InvestmentCashLinker refreshKey={investmentRefreshKey} />
        {rescanning && <OperationStatusPanel state="working" title="Scanning your ledger for transfers" description="Replacing the bounded review queue with the latest matches. No transfer decision is being changed." />}
        {status}
        {error && consoleStyle && <p role="alert">{error}</p>}
        {cleared ?? <>{emptyMessage}<div>{scan}</div></>}
      </div>
    )
  }

  return (
    <div className="grid gap-5 console-transfer-queue">
      {status}
      <InvestmentCashLinker refreshKey={investmentRefreshKey} />
      {error && (
        <div role="alert" className="rounded-[10px] border border-[var(--color-neg)] bg-[var(--color-neg)]/5 px-3 py-2 text-[13px] text-[var(--color-neg)]">
          {error}
        </div>
      )}

      {rescanning && <OperationStatusPanel state="working" title="Scanning your ledger for transfers" description="Replacing the bounded review queue with the latest matches. No transfer decision is being changed." />}

      {cleared ?? <div className={consoleStyle ? 'flex flex-wrap items-center justify-between gap-3' : 'flex items-center justify-between'}>
        <p className="text-[13px] text-muted">
          {suggested.length > 0
            ? <>
                <strong className="text-ink">{suggestions.data?.count}</strong> {suggestions.data?.count === 1 ? 'transfer needs' : 'transfers need'} your review
                {overflowSummary.suggestedPairCount > 1 && <> across {overflowSummary.suggestedPairCount} account pairs</>}
              </>
            : consoleStyle && unmatchedTotal ? 'No suggested pairs. Review possible transfers below.' : 'Everything is reviewed.'}
        </p>
        <Button variant="ghost" onClick={rescan} disabled={rescanning}>
          {rescanning ? 'Scanning…' : 'Rescan ledger'}
        </Button>
      </div>}

      {overflow.length > 0 && (
        <div className="rounded-[10px] border border-[var(--color-warn)] bg-[var(--color-warn)]/5 px-3 py-2.5 text-[12.5px] text-ink2">
          <strong className="text-ink">{overflowSummary.bucketCount}</strong> repetitive amount
          {overflowSummary.bucketCount === 1 ? ' group was' : ' groups were'} skipped rather than paired unsafely
          {' '}(<strong className="text-ink">{overflowSummary.legCount}</strong> transactions).{' '}
          <button
            onClick={() => setShowOverflow((shown) => !shown)}
            aria-expanded={showOverflow}
            className="inline-flex min-h-11 items-center px-1 font-semibold text-ink underline decoration-dotted"
          >
            {showOverflow ? 'Hide amounts' : `Review ${overflowSummary.bucketCount} amount ${overflowSummary.bucketCount === 1 ? 'group' : 'groups'}`}
          </button>
          <AnimatePresence>
            {showOverflow && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 grid gap-1 overflow-hidden border-t border-[var(--hair)] pt-2"
              >
                <QueueNavigation label="Overflow amount pages" queue={buckets} />
                {overflow.map((bucket) => (
                  <div key={bucket.amount_cents}>
                    <strong className="text-ink">{fmtCents(bucket.amount_cents)}</strong>
                    {' · '}{bucket.leg_count} possible legs; the matcher left them unpaired and they may appear in Possible transfers below.
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {unmatchedTotal > 0 && (
        <div className="rounded-[10px] border border-[var(--color-warn)] bg-[var(--color-warn)]/5 px-3 py-2.5 text-[12.5px] text-ink2">
          <strong className="text-ink">{unmatchedTotal}</strong> transaction{unmatchedTotal === 1 ? '' : 's'} look{unmatchedTotal === 1 ? 's' : ''} like a transfer but no matching pair was found.
          They're counted as regular income or spending until you say otherwise.
          {unmatchedTotal > 500 && (
            <> Showing the most recent 500.</>
          )}{' '}
          <button
            onClick={() => setShowUnmatched((s) => !s)}
            aria-expanded={showUnmatched}
            className="inline-flex min-h-11 items-center px-1 font-semibold text-ink underline decoration-dotted"
          >
            {showUnmatched ? 'Hide' : 'Review them'}
          </button>
        </div>
      )}

      {suggestedGroups.length > 0 && (
        <div className="grid gap-3">
          {suggestedGroups.map((group) => (
            <SuggestedGroupPanel
              key={group.key}
              group={group}
              accountName={accountName}
              expanded={expandedGroups.has(group.key)}
              onToggleExpand={() => toggleGroupExpanded(group.key)}
              deselected={deselected}
              onToggleSelect={toggleSelected}
              busy={batchBusy === group.key}
              onBulkDecide={(linkIds, v) => decideBatch(group.key, linkIds, v)}
            />
          ))}
        </div>
      )}

      <QueueNavigation label="Suggested transfer pages" queue={suggestions} />
      {groupless.length > 0 && (
        <div className="grid gap-3">
          {groupless.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              accountName={accountName}
              busy={deciding === link.id}
              onDecide={(v) => decide(link.id, v)}
            />
          ))}
        </div>
      )}

      {auto.length > 0 && (
        <div className="grid gap-2">
          <button
            onClick={() => setShowAuto((s) => !s)}
            aria-expanded={showAuto}
            className="flex min-h-11 items-center gap-2 text-left text-[13px] font-medium text-muted transition hover:text-ink"
          >
            <span className={`transition-transform ${showAuto ? 'rotate-90' : ''}`}>›</span>
            Linked automatically ({automatic.data?.count})
          </button>
          <AnimatePresence>
            {showAuto && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="grid gap-2 overflow-hidden"
              >
                <QueueNavigation label="Automatic transfer pages" queue={automatic} />
                {auto.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--hair)] px-3 py-2 text-[12.5px]"
                  >
                    <span className="min-w-0 truncate text-muted">
                      {accountName(link.from_txn?.account_id ?? '')} → {accountName(link.to_txn?.account_id ?? '')}
                      {' · '}{link.from_txn ? fmtCents(Math.abs(link.from_txn.amount)) : ''}
                      {' · '}{formatDay(link.from_txn?.date)}
                    </span>
                    <button
                      onClick={() => decide(link.id, 'rejected')}
                      disabled={deciding === link.id}
                      className="min-h-11 flex-shrink-0 px-2 text-[13px] font-medium text-muted underline decoration-dotted transition hover:text-ink disabled:opacity-50"
                    >
                      Undo
                    </button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {unmatched.length > 0 && (
        <AnimatePresence>
          {showUnmatched && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid gap-3 overflow-hidden"
            >
              <QueueNavigation label="Unmatched transfer pages" queue={legs} />
              {groupUnmatched(unmatched).map((group) => (
                <UnmatchedGroupPanel
                  key={group.key}
                  group={group}
                  accountName={accountName}
                  expanded={unmatchedExpandedGroups.has(group.key)}
                  onToggleExpand={() => toggleUnmatchedGroupExpanded(group.key)}
                  deselected={unmatchedDeselected}
                  onToggleSelect={toggleUnmatchedSelected}
                  busy={unmatchedBatchBusy === group.key}
                  onBulkDecide={(txnIds, v) => decideLegBatch(group.key, txnIds, v)}
                  onSingleDecide={(txnId, v) => decideLeg(txnId, v)}
                  singleBusy={deciding}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  )
}
