import type { BudgetHomeCards, ExpenseCategoryShare } from '../../lib/consoleHome'
import { billWhen, type PlanBills, type PlanGoals, type PlanReadState } from '../../lib/consolePlan'
import type { Series } from '../../lib/recurring'
import { budgetValueQualification } from '../../lib/budgetPresentation'
import { consoleMoney } from './ConsoleHub'
import { FocusRing } from './FocusRing'
import { FocusRow } from './FocusRow'
import { GlassSurface } from './GlassSurface'

const budgetMessages: Record<Exclude<BudgetHomeCards['state'], 'cards'>, string> = {
  cold: 'Open Budget to see this period’s category limits.',
  loading: 'Loading Budget categories.',
  failed: 'Budget categories couldn’t load. Open Budget to try again.',
  'no-plan': 'No saved budget yet. Open Budget to set one up.',
  unsupported: 'This budget uses a method Home can’t show. Open Budget for details.',
  'other-period': 'Open Budget to see the current period’s category limits.',
  'no-limits': 'This budget tracks everyday spending as one amount, without category limits.',
  unavailable: 'Category details are unavailable. Open Budget to refresh them.',
  refreshing: 'Budget figures are refreshing.',
}

/** Up to four Budget category limits, each as spent of allocated in exact cents. */
export function BudgetCategoryCards({ budget, redacted, onOpen }: { budget: BudgetHomeCards; redacted: boolean; onOpen: () => void }) {
  return <div className="console-activity console-home-activity">
    <h2>Category limits</h2>
    {budget.state !== 'cards' ? <p className="console-empty console-activity-placeholder" data-budget-home-state={budget.state}>
      {budgetMessages[budget.state]}
    </p> : <>
      <FocusRow label="Budget category cards" className="console-activity-row">
        {budget.cards.map(card => {
          const { planned, spent } = card
          const allocation = planned.availability === 'known' ? `of ${consoleMoney(planned.cents)}` : 'Allocation unavailable'
          const detail = spent.availability !== 'known' ? budgetValueQualification(spent) || 'Spending unavailable'
            : card.over ? `${allocation} · over the limit` : card.progress === undefined ? allocation : `${allocation} · ${card.progress}%`
          return <GlassSurface as="button" material="activity" key={card.id} className="console-activity-card console-budget-card"
            data-console-row-item data-budget-home-card={card.categoryId} data-over={card.over || undefined} onClick={onOpen}>
            <FocusRing layer="sweep" />
            <span className="console-card-title">{card.name}</span>
            {redacted ? <strong>Amount hidden</strong> : spent.availability === 'known'
              ? <strong className="tabular-nums">{consoleMoney(spent.cents)}</strong>
              : <strong className="console-card-unavailable">Unavailable</strong>}
            <span className={`console-card-category${redacted ? '' : ' tabular-nums'}`}>{redacted ? 'Allocation hidden' : detail}</span>
            {!redacted && card.progress !== undefined && <span className="console-card-meter" aria-hidden="true">
              <span style={{ inlineSize: `${card.progress}%` }} />
            </span>}
          </GlassSurface>
        })}
      </FocusRow>
      {budget.total > budget.cards.length && <p className="console-asof">
        Showing {budget.cards.length} of {budget.total} categories, in Budget’s order.
      </p>}
    </>}
  </div>
}

/** One card that shares the Expenses hub's category totals for the same period. */
export function ExpenseCategoriesCard({ categories, redacted, onOpen }: { categories: ExpenseCategoryShare[]; redacted: boolean; onOpen: () => void }) {
  return <GlassSurface as="button" material="activity" className="console-activity-card console-category-card"
    data-console-row-item data-expense-home-categories onClick={onOpen}>
    <FocusRing layer="sweep" />
    <span className="console-card-category">Top categories by share of gross outflow</span>
    <span className="console-category-list">
      {categories.map(category => {
        const percent = Math.round(category.share * 100)
        return <span key={category.category} className="console-category-share" data-expense-category={category.category}
          data-expense-category-cents={redacted ? undefined : category.cents}>
          <span className="console-category-name">{category.name}</span>
          <span className="console-category-figure tabular-nums">{redacted ? 'Hidden' : consoleMoney(category.cents)} · {percent}%</span>
          <span className="console-card-meter" aria-hidden="true"><span style={{ inlineSize: `${Math.min(100, percent)}%` }} /></span>
        </span>
      })}
    </span>
  </GlassSurface>
}

/** Key hints for a fine pointer. The labels follow the bindings Home actually has. */
export function ConsoleKeyHints({ centreShortcut }: { centreShortcut: boolean }) {
  return <p className="console-key-hints" data-console-key-hints>
    <span><span aria-hidden="true"><kbd>←</kbd> <kbd>→</kbd></span><span className="sr-only">Left and right arrow keys</span> Navigate</span>
    <span><kbd>Enter</kbd> Open</span>
    {centreShortcut ? <span><kbd>C</kbd> Control Centre</span> : <span>Control Centre shortcut off</span>}
  </p>
}

const planMessages: Record<'goals' | 'bills', Record<Exclude<PlanReadState, 'ready'>, string>> = {
  goals: {
    cold: 'Open Goals to see your targets and progress.',
    loading: 'Loading goals.',
    failed: 'Goals couldn’t load. Open Goals to try again.',
  },
  bills: {
    cold: 'Open Bills to see what’s due in the next 14 days.',
    loading: 'Loading recurring bills.',
    failed: 'Recurring bills couldn’t load. Open Bills to try again.',
  },
}

/** Up to four active goals, each as its current value of the target. */
export function GoalHomeCards({ state, goals, redacted, onOpen }: {
  state: PlanReadState; goals?: PlanGoals; redacted: boolean; onOpen: () => void
}) {
  const active = goals?.active ?? []
  const cards = active.slice(0, 4)
  return <div className="console-activity console-home-activity">
    <h2>Active goals</h2>
    {state !== 'ready' || !goals ? <p className="console-empty console-activity-placeholder" data-plan-home-state={state}>
      {planMessages.goals[state === 'ready' ? 'loading' : state]}
    </p> : !cards.length ? <p className="console-empty console-activity-placeholder" data-plan-home-state="empty">
      {goals.inactive.length ? 'No active goals. Paused and archived goals are in Goals.' : 'No goals yet. Open Goals to set one.'}
    </p> : <>
      <FocusRow label="Goal cards" className="console-activity-row">
        {cards.map(goal => {
          const progress = goal.progress
          const detail = !progress ? 'Progress unavailable' : goal.reached ? `of ${consoleMoney(goal.targetCents)} · target reached`
            : `of ${consoleMoney(goal.targetCents)} · ${progress.percent}%`
          return <GlassSurface as="button" material="activity" key={goal.id} className="console-activity-card console-budget-card"
            data-console-row-item data-goal-home-card={goal.id} onClick={onOpen}>
            <FocusRing layer="sweep" />
            <span className="console-card-title">{goal.name}</span>
            {redacted ? <strong>Amount hidden</strong> : progress
              ? <strong className="tabular-nums">{consoleMoney(progress.valueCents)}</strong>
              : <strong className="console-card-unavailable">Unavailable</strong>}
            <span className={`console-card-category${redacted ? '' : ' tabular-nums'}`}>{redacted ? 'Target hidden' : detail}</span>
            {!redacted && progress && <span className="console-card-meter" aria-hidden="true">
              <span style={{ inlineSize: `${progress.percent}%` }} />
            </span>}
          </GlassSurface>
        })}
      </FocusRow>
      {active.length > cards.length && <p className="console-asof">Showing {cards.length} of {active.length} active goals.</p>}
    </>}
  </div>
}

export function billAmount(series: Series) {
  return `${series.kind === 'variable' ? 'About ' : ''}${consoleMoney(series.expected)}`
}

/** The next four active bills, soonest first. */
export function BillHomeCards({ state, bills, today, redacted, onOpen }: {
  state: PlanReadState; bills?: PlanBills; today: string; redacted: boolean; onOpen: () => void
}) {
  const cards = bills?.upcoming.slice(0, 4) ?? []
  return <div className="console-activity console-home-activity">
    <h2>Coming up</h2>
    {state !== 'ready' || !bills ? <p className="console-empty console-activity-placeholder" data-plan-home-state={state}>
      {planMessages.bills[state === 'ready' ? 'loading' : state]}
    </p> : !cards.length ? <p className="console-empty console-activity-placeholder" data-plan-home-state="empty">
      No recurring bills detected yet.
    </p> : <>
      <FocusRow label="Bill cards" className="console-activity-row">
        {cards.map(series => <GlassSurface as="button" material="activity" key={series.id} className="console-activity-card"
          data-console-row-item data-bill-home-card={series.id} onClick={onOpen}>
          <FocusRing layer="sweep" />
          <span className="console-card-emblem"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5h14v15H5zM5 10h14M9 3v4m6-4v4" /></svg></span>
          <span className="console-card-category">{billWhen(series.nextExpected, today)}</span>
          {redacted ? <strong>Amount hidden</strong> : <strong className="tabular-nums">{billAmount(series)}</strong>}
          <span className="console-card-title">{series.label}</span>
        </GlassSurface>)}
      </FocusRow>
      {bills.upcoming.length > cards.length && <p className="console-asof">Showing the next {cards.length} of {bills.upcoming.length} active bills.</p>}
    </>}
  </div>
}

/** Ingestion has no Home figures. One card opens the import. */
export function ImportHomeCard({ onOpen }: { onOpen: () => void }) {
  return <div className="console-activity console-home-activity">
    <h2>Statements</h2>
    <FocusRow label="Import cards" className="console-activity-row">
      <GlassSurface as="button" material="activity" className="console-activity-card" data-console-row-item data-import-home-card onClick={onOpen}>
        <FocusRing layer="sweep" />
        <span className="console-card-emblem"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" /></svg></span>
        <span className="console-card-category">CSV statement</span>
        <strong>Import</strong>
        <span className="console-card-title">Choose an account, review the rows, then import them</span>
      </GlassSurface>
    </FocusRow>
  </div>
}
