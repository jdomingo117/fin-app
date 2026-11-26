import type { BudgetHomeCards, ExpenseCategoryShare } from '../../lib/consoleHome'
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
        Showing {budget.cards.length} of {budget.total} categories, closest to their limit first.
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
