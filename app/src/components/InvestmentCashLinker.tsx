import { useConsoleDayLabel } from '../hooks/useConsoleDayLabel'
import { useQueuePage } from '../lib/queuePage'
import { QueueNavigation } from './QueueNavigation'
import ReportStatus from './ReportStatus'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../lib/supabaseClient'
import { useData } from '../contexts/DataContext'
import { fmtCents } from '../data'
import { Button } from './Controls'
import { OperationStatusPanel } from './OperationStatus'

interface CashLink {
  id: string
  state: 'auto' | 'suggested' | 'confirmed'
  score: number
  reasons: string[]
  ambiguous: boolean
  transaction: {
    id: string; date: string; amount: number; original_description: string | null; account_id: string
  } | null
  activity: {
    id: string; trade_date: string; activity_type: 'purchase' | 'redemption'; value_cents: number; account_id: string
  } | null
}

export default function InvestmentCashLinker({ refreshKey = 0 }: { refreshKey?: number }) {
  const { accounts, refreshData } = useData()
  const suggestions = useQueuePage<CashLink>('investment_cash_links','score',{ state:'suggested' },refreshKey)
  const automatic = useQueuePage<CashLink>('investment_cash_links','score',{ state:'auto' },refreshKey)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [showAuto, setShowAuto] = useState(false)

  const decide = async (linkId: string, verdict: 'confirmed' | 'rejected') => {
    setBusy(linkId); setError('')
    try {
      const { error: invokeError } = await supabase.functions.invoke('decide-investment-cash-link', {
        body: { link_id: linkId, verdict },
      })
      if (invokeError) throw invokeError
      await refreshData()
    } catch {
      setError('That investment funding decision could not be saved. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  if (suggestions.error || automatic.error) return <ReportStatus report={suggestions.error ? suggestions : automatic} label="Investment funding" />
  if (suggestions.pending || automatic.pending) return <OperationStatusPanel state="working" title="Checking investment funding" description="Fetching the current bounded funding review. No funding decision is being changed." />
  const suggested = suggestions.data?.rows ?? []
  const auto = automatic.data?.rows ?? []
  if (!suggested.length && !auto.length && !error) return null
  const accountName = (id?: string) => accounts.find((account) => account.id === id)?.name ?? 'Unknown account'

  return <section aria-labelledby="investment-cash-title" className="grid gap-3 border-b border-[var(--hair)] pb-5">
    <div>
      <p id="investment-cash-title" className="text-[13px] font-semibold text-ink">Investment funding</p>
      <p className="mt-0.5 text-[12px] text-muted">Bank movements matched to managed-fund purchases or redemptions. Distributions stay classified as investment income.</p>
    </div>
    {error && <div role="alert" className="rounded-[10px] border border-[var(--color-neg)] bg-[var(--color-neg)]/5 px-3 py-2 text-[12.5px] text-neg">{error}</div>}
    {suggested.length > 0 && <div className="grid gap-2">
      <p className="text-[12.5px] text-muted"><strong className="text-ink">{suggestions.data?.count}</strong> investment funding match{suggested.length === 1 ? '' : 'es'} need review.</p>
      <QueueNavigation label="Suggested funding pages" queue={suggestions} />
      {suggested.map((link) => <CashLinkRow key={link.id} link={link} accountName={accountName} busy={busy === link.id} onDecide={decide} />)}
    </div>}
    {auto.length > 0 && <div className="grid gap-2">
      <button type="button" onClick={() => setShowAuto((shown) => !shown)} aria-expanded={showAuto} className="flex items-center gap-2 text-left text-[12.5px] font-medium text-muted transition hover:text-ink">
        <span aria-hidden="true" className={`transition-transform ${showAuto ? 'rotate-90' : ''}`}>›</span>
        Investment funding linked automatically ({automatic.data?.count})
      </button>
      <AnimatePresence>{showAuto && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="grid gap-2 overflow-hidden">
        <QueueNavigation label="Automatic funding pages" queue={automatic} />
        {auto.map((link) => <CashLinkRow key={link.id} link={link} accountName={accountName} busy={busy === link.id} onDecide={decide} />)}
      </motion.div>}</AnimatePresence>
    </div>}
  </section>
}

function CashLinkRow({ link, accountName, busy, onDecide }: {
  link: CashLink
  accountName: (id?: string) => string
  busy: boolean
  onDecide: (id: string, verdict: 'confirmed' | 'rejected') => void
}) {
  const formatDay = useConsoleDayLabel()
  const amount = Math.abs(link.transaction?.amount ?? link.activity?.value_cents ?? 0)
  const direction = link.activity?.activity_type === 'redemption' ? 'Redemption to' : 'Contribution from'
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[var(--hair)] px-3 py-2.5">
    <div className="min-w-0">
      <p className="truncate text-[12.5px] font-medium text-ink">
        {direction} {accountName(link.transaction?.account_id)} · {fmtCents(amount)}
      </p>
      <p className="mt-0.5 text-[11.5px] text-muted">
        {formatDay(link.transaction?.date)} → {accountName(link.activity?.account_id)} · {Math.round(link.score * 100)}% confidence
        {link.ambiguous ? ' · ambiguous' : ''}
      </p>
    </div>
    <div className="flex gap-2">
      {link.state === 'suggested' && <Button onClick={() => onDecide(link.id, 'confirmed')} disabled={busy}>Confirm</Button>}
      <Button variant="ghost" onClick={() => onDecide(link.id, 'rejected')} disabled={busy}>{link.state === 'auto' ? 'Undo' : 'Not a match'}</Button>
    </div>
  </div>
}
