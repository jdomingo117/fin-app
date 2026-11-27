import { useState } from 'react'
import { Navigate, useOutletContext } from 'react-router-dom'
import ConsoleHub, { ConsoleModule, type ConsoleArt, type ConsoleFigure } from '../components/console/ConsoleHub'
import type { ConsoleOutlet } from '../components/console/ConsoleViewport'
import { useConsolePreferences } from '../components/console/ConsolePreferences'
import { FocusRow } from '../components/console/FocusRow'
import { billAmount } from '../components/console/HomeCards'
import { usePlanReports } from '../components/console/PlanReports'
import RecurringSeriesDialog from '../components/RecurringSeriesDialog'
import ReportStatus from '../components/ReportStatus'
import { useData } from '../contexts/DataContext'
import { fmtCents } from '../data'
import { useRedactBalances } from '../hooks/useRedactBalances'
import { BILLS_WINDOW_DAYS, billWhen, cadenceText, planBills } from '../lib/consolePlan'
import { noticeState } from '../lib/consoleNotices'
import { TODAY, dateRangeLabel } from '../lib/period'
import type { Series } from '../lib/recurring'
import { supabase } from '../lib/supabaseClient'
import { useView } from '../router'
import '../components/console/console-plan.css'

/**
 * Console's Bills hub: active recurring series from the session's shared
 * recurrence read, soonest first. Managing a bill only changes Halcyon's
 * projection, through manage-recurring-series, with the existing form.
 */
export default function BillsHub() {
  const route = useOutletContext<ConsoleOutlet | null>()
  const { invalidateReports } = useData()
  const { go } = useView()
  const redacted = useRedactBalances()
  const audio = useConsolePreferences()
  const { recurrence } = usePlanReports({ recurrence: true })
  const data = recurrence.data
  const bills = data ? planBills(data.active, TODAY) : undefined
  const [managing, setManaging] = useState<Series>()
  const [undoEventId, setUndoEventId] = useState<string | null>(null)
  const [undoError, setUndoError] = useState('')
  const [undoing, setUndoing] = useState(false)

  if (!route) return <Navigate to="/expenses" replace state={noticeState('recurring')} />

  const windowLabel = `Due in the next ${BILLS_WINDOW_DAYS} days`
  // With no bills detected at all, say so rather than report $0 due.
  const figure: ConsoleFigure = bills?.upcoming.length ? { label: windowLabel, cents: bills.dueCents }
    : { label: windowLabel, placeholder: bills ? 'No bills detected' : recurrence.error ? 'Unavailable' : 'Loading…' }
  const strip: ConsoleFigure[] = data && bills?.upcoming.length ? [
    { label: 'Monthly commitment', cents: data.monthlyCommitment },
    { label: 'Annualised', cents: data.annualBurn },
  ] : []
  const ratio = data?.pressure.ratio
  const art: ConsoleArt | undefined = data && ratio !== null && ratio !== undefined ? {
    label: `Recurring share of the last 30 days’ spending, ${fmtCents(data.pressure.recurring)} of ${fmtCents(data.pressure.total)}`,
    percent: Math.max(0, Math.min(100, Math.round(ratio * 100))), caption: 'Recurring share',
  } : undefined
  const later = bills?.upcoming.filter(series => !bills.due.includes(series)) ?? []

  async function undo() {
    if (!undoEventId) return
    setUndoing(true); setUndoError('')
    const { error } = await supabase.functions.invoke('manage-recurring-series', { body: { action: 'undo', event_id: undoEventId } })
    setUndoing(false)
    if (error) { setUndoError(error.message || 'Couldn’t undo this bill change.'); return }
    setUndoEventId(null)
    invalidateReports()
  }

  function manage(series: Series) {
    audio?.play('select')
    setUndoError('')
    setManaging(series)
  }

  return <ConsoleHub id="bills" title="Bills" period={dateRangeLabel(TODAY, bills?.until ?? TODAY, true)} onBack={route.back}
    entry={route.entry?.id === 'bills' ? route.entry : undefined} figure={figure} strip={strip} art={art} redacted={redacted}>
    <div className="console-analysis-modules console-plan">
      {data && (recurrence.error || recurrence.pending) && <div className="console-plan-status"><ReportStatus report={recurrence} label="Bills" /></div>}
      {undoEventId && <p className="console-plan-status" role="status">
        Bill updated. <button type="button" className="console-plan-link" disabled={undoing} onClick={undo}>{undoing ? 'Undoing…' : 'Undo'}</button>
      </p>}
      {undoError && <p className="console-plan-status" role="alert">{undoError}</p>}
      {!bills ? <ConsoleModule title={windowLabel} kind="flat"><div className="console-plan-empty"><ReportStatus report={recurrence} label="Bills" /></div></ConsoleModule>
        : !bills.upcoming.length ? <ConsoleModule title={windowLabel} kind="flat">
          <p className="console-plan-empty">No recurring bills detected yet. Halcyon finds a bill once a merchant has charged an account at a steady interval at least three times.</p>
        </ConsoleModule>
        : <FocusRow label="Bill modules" className="console-module-grid">
          <ConsoleModule title={windowLabel}>
            {bills.due.length ? <BillList bills={bills.due} redacted={redacted} onManage={manage} />
              : <p className="console-plan-empty">Nothing is due in the next {BILLS_WINDOW_DAYS} days.</p>}
            {bills.estimated && <p className="console-plan-note">Variable bills show an estimate from their recent charges.</p>}
          </ConsoleModule>
          <div className="console-module-companions">
            <ConsoleModule title="Later" order={1}>
              {later.length ? <BillList bills={later} redacted={redacted} onManage={manage} />
                : <p className="console-plan-empty">No other active bills.</p>}
            </ConsoleModule>
            <ConsoleModule title="Recurring hub" order={2}>
              <p className="console-plan-note">The billing calendar, funding accounts and bills Halcyon isn’t sure about yet are in Expenses.</p>
              <button type="button" className="console-plan-action" onClick={() => go('expenses', { state: noticeState('recurring') })}>
                Open the Recurring hub
              </button>
            </ConsoleModule>
          </div>
        </FocusRow>}
    </div>
    {managing && <div onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setManaging(undefined) } }}>
      <RecurringSeriesDialog series={managing} onClose={() => setManaging(undefined)}
        onChanged={async () => invalidateReports()} onSaved={eventId => { setUndoEventId(eventId); setUndoError('') }} />
    </div>}
  </ConsoleHub>
}

function BillList({ bills, redacted, onManage }: { bills: Series[]; redacted: boolean; onManage: (series: Series) => void }) {
  return <ul className="console-plan-list">
    {bills.map(series => <li key={series.id} data-plan-bill={series.id}>
      <div className="console-plan-row">
        <div className="console-plan-name">
          <strong>{series.label}</strong>
          <span>{billWhen(series.nextExpected, TODAY)} · {cadenceText[series.cadence]} · {series.fundingAccount}</span>
        </div>
        <span className={`console-plan-amount${redacted ? '' : ' tabular-nums'}`}>{redacted ? 'Hidden' : billAmount(series)}</span>
        <button type="button" className="console-plan-link" aria-label={`Manage ${series.label}`} onClick={() => onManage(series)}>Manage</button>
      </div>
    </li>)}
  </ul>
}
