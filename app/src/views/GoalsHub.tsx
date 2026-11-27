import { useState } from 'react'
import { Navigate, useOutletContext } from 'react-router-dom'
import ConsoleHub, { ConsoleModule, consoleMoney, type ConsoleArt, type ConsoleFigure } from '../components/console/ConsoleHub'
import type { ConsoleOutlet } from '../components/console/ConsoleViewport'
import { useConsolePreferences } from '../components/console/ConsolePreferences'
import { FocusRow } from '../components/console/FocusRow'
import { usePlanReports } from '../components/console/PlanReports'
import PlanningGoalDialog from '../components/PlanningGoalDialog'
import ReportStatus from '../components/ReportStatus'
import { useData } from '../contexts/DataContext'
import { fmtCents } from '../data'
import { useRedactBalances } from '../hooks/useRedactBalances'
import { planGoals, type GoalView } from '../lib/consolePlan'
import { noticeState } from '../lib/consoleNotices'
import { fullDayLabel } from '../lib/period'
import type { PlanningGoal } from '../lib/planning'
import { supabase } from '../lib/supabaseClient'
import { useView } from '../router'
import '../components/console/console-plan.css'

const metricText = { cash: 'Cash holdings', net_worth: 'Net worth' } as const
const statusText = { active: 'Active', paused: 'Paused', archived: 'Archived' } as const

/**
 * Console's Goals hub. It shows planning goals and their progress from the
 * session's shared planning read, and edits them only through manage-planning,
 * using the same goal form as Strategic projections.
 */
export default function GoalsHub() {
  const route = useOutletContext<ConsoleOutlet | null>()
  const { accounts, invalidateReports } = useData()
  const { go } = useView()
  const redacted = useRedactBalances()
  const audio = useConsolePreferences()
  const ringGoal = audio?.preferences.overviewGoal ?? null
  const { planning } = usePlanReports({ planning: true })
  const goals = planning.data ? planGoals(planning.data.planningGoals, accounts, ringGoal) : undefined
  // `null` is a new goal. Undefined means the form is closed.
  const [editing, setEditing] = useState<PlanningGoal | null>()
  const [undoEventId, setUndoEventId] = useState<string | null>(null)
  const [undoError, setUndoError] = useState('')
  const [undoing, setUndoing] = useState(false)

  if (!route) return <Navigate to="/income" replace state={noticeState('projections')} />

  const featured = goals?.featured
  const figure: ConsoleFigure = featured?.progress ? { label: `${featured.name} · current value`, cents: featured.progress.valueCents }
    : { label: 'Goals', placeholder: !goals ? planning.error ? 'Unavailable' : 'Loading…'
      : goals.active.length ? 'Progress unavailable' : 'No active goals' }
  const strip: ConsoleFigure[] = featured?.progress ? [
    { label: 'Target', cents: featured.targetCents },
    { label: 'To go', cents: Math.max(0, featured.targetCents - featured.progress.valueCents) },
  ] : []
  const art: ConsoleArt | undefined = featured?.progress ? {
    label: `Progress toward ${featured.name}, ${fmtCents(featured.progress.valueCents)} of ${fmtCents(featured.targetCents)}`,
    percent: featured.progress.percent, caption: featured.name,
  } : undefined

  async function undo() {
    if (!undoEventId) return
    setUndoing(true); setUndoError('')
    const { error } = await supabase.functions.invoke('manage-planning', { body: { action: 'undo', event_id: undoEventId } })
    setUndoing(false)
    if (error) { setUndoError(error.message || 'Couldn’t undo this goal change.'); return }
    setUndoEventId(null)
    invalidateReports()
  }

  function open(goal: PlanningGoal | null) {
    audio?.play('select')
    setUndoError('')
    setEditing(goal)
  }

  return <ConsoleHub id="goals" title="Goals" compactLabel={featured?.progress ? featured.name : 'Goals'} period="Progress from current account balances" onBack={route.back}
    entry={route.entry?.id === 'goals' ? route.entry : undefined} figure={figure} strip={strip} art={art} redacted={redacted}>
    <div className="console-analysis-modules console-plan">
      {planning.data && (planning.error || planning.pending) && <div className="console-plan-status"><ReportStatus report={planning} label="Goals" /></div>}
      {undoEventId && <p className="console-plan-status" role="status">
        Goal saved. <button type="button" className="console-plan-link" disabled={undoing} onClick={undo}>{undoing ? 'Undoing…' : 'Undo'}</button>
      </p>}
      {undoError && <p className="console-plan-status" role="alert">{undoError}</p>}
      {!goals ? <ConsoleModule title="Active goals" kind="flat"><div className="console-plan-empty"><ReportStatus report={planning} label="Goals" /></div></ConsoleModule>
        : <FocusRow label="Goal modules" className="console-module-grid">
          <ConsoleModule title="Active goals" tools={<button type="button" className="console-plan-action" data-dialog-focus-fallback onClick={() => open(null)}>New goal</button>}>
            {goals.active.length ? <GoalList goals={goals.active} redacted={redacted} onEdit={open} />
              : <p className="console-plan-empty">{goals.inactive.length ? 'No active goals. Resume a paused goal or set a new one.'
                : 'No goals yet. A goal sets a target for cash or net worth across the accounts you choose.'}</p>}
          </ConsoleModule>
          <div className="console-module-companions">
            <ConsoleModule title="Paused and archived" order={1}>
              {goals.inactive.length ? <GoalList goals={goals.inactive} redacted={redacted} onEdit={open} />
                : <p className="console-plan-empty">None.</p>}
            </ConsoleModule>
            <ConsoleModule title="Projections" order={2}>
              <p className="console-plan-note">Scenarios, planned events and the forecast for each goal are in Strategic projections.</p>
              <button type="button" className="console-plan-action" onClick={() => go('income', { state: noticeState('projections') })}>
                Open Strategic projections
              </button>
            </ConsoleModule>
          </div>
        </FocusRow>}
    </div>
    {editing !== undefined && <div onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setEditing(undefined) } }}>
      <PlanningGoalDialog goal={editing} accounts={accounts} onClose={() => setEditing(undefined)}
        onChanged={async () => invalidateReports()} onSaved={eventId => { setUndoEventId(eventId); setUndoError('') }} />
    </div>}
  </ConsoleHub>
}

function GoalList({ goals, redacted, onEdit }: { goals: GoalView[]; redacted: boolean; onEdit: (goal: PlanningGoal) => void }) {
  return <ul className="console-plan-list">
    {goals.map(goal => {
      const progress = goal.progress
      return <li key={goal.id} data-plan-goal={goal.id}>
        <div className="console-plan-row">
          <div className="console-plan-name">
            <strong>{goal.name}</strong>
            <span>{metricText[goal.metric]}{goal.status !== 'active' ? ` · ${statusText[goal.status]}` : ''}
              {goal.targetDate ? ` · by ${fullDayLabel(goal.targetDate)}` : ''}</span>
          </div>
          <button type="button" className="console-plan-link" aria-label={`Edit ${goal.name}`} onClick={() => onEdit(goal)}>Edit</button>
        </div>
        <p className={`console-plan-figure${redacted ? '' : ' tabular-nums'}`}>
          {redacted ? 'Amounts hidden' : !progress ? `Progress unavailable · target ${consoleMoney(goal.targetCents)}`
            : `${consoleMoney(progress.valueCents)} of ${consoleMoney(goal.targetCents)} · ${goal.reached ? 'target reached' : `${progress.percent}%`}`}
        </p>
        {!redacted && progress && <span className="console-card-meter" aria-hidden="true"><span style={{ inlineSize: `${progress.percent}%` }} /></span>}
      </li>
    })}
  </ul>
}
